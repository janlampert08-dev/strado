"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";

export interface RatingFormState {
  error: string | null;
  /** True, wenn der letzte Durchlauf gespeichert hat — für die
   *  Erfolgsmeldung im Formular (Muster aus VisibilitySettings). */
  gespeichert?: boolean;
}

const RATING_COOLDOWN_MS = 3000;
const MAX_KOMMENTAR_LENGTH = 1000;

// Die Skala. Dieselben Grenzen stehen als Check-Constraint in
// 0095_sterne_wieder_einfuehren.sql — die Prüfung hier ist das schnelle
// Feedback, die in der Datenbank ist die verbindliche: route_ratings trägt
// volle Tabellen-Grants, ein direkter PostgREST-Request käme an dieser
// Funktion vorbei.
const MIN_STERNE = 1;
const MAX_STERNE = 5;

// Sterne aus dem Formular lesen.
//
// Drei Zustände, und der mittlere ist der Grund für diese Funktion: kein Feld
// mitgeschickt und ein leeres Feld bedeuten beide "keine Wertung" (null),
// alles andere muss eine ganze Zahl im Band sein. Ein unbrauchbarer Wert
// wird NICHT stillschweigend zu null — dann verlöre jemand, der eine Wertung
// abgeben wollte, sie kommentarlos.
function sterneLesen(roh: FormDataEntryValue | null): number | null | "ungueltig" {
  if (roh === null) return null;
  const text = String(roh).trim();
  if (text === "") return null;

  const zahl = Number(text);
  if (!Number.isInteger(zahl) || zahl < MIN_STERNE || zahl > MAX_STERNE) return "ungueltig";
  return zahl;
}

export async function submitRating(
  routeId: string,
  _prevState: RatingFormState,
  formData: FormData,
): Promise<RatingFormState> {
  if (!isValidUuid(routeId)) return { error: "Strecke nicht gefunden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const kommentar = String(formData.get("kommentar") ?? "").trim() || null;
  const sterne = sterneLesen(formData.get("sterne"));

  if (sterne === "ungueltig") {
    return { error: "Ungültige Wertung. Bitte lade die Seite neu." };
  }

  // Bis 0095 war der Kommentar Pflicht, weil es nichts anderes gab. Jetzt
  // reicht eines von beidem: wer nur Sterne vergeben will, soll nicht
  // zusätzlich etwas schreiben müssen, und wer nur schreiben will, keine
  // Zahl erfinden. Leer bleiben dürfen aber nicht beide — das wäre ein
  // Formular, das nichts aussagt, und beim Aktualisieren löschte es die
  // bestehende Bewertung durch die Hintertür statt über "Löschen".
  if (!kommentar && sterne === null) {
    return { error: "Bitte vergib Sterne oder schreib einen Kommentar." };
  }
  if (kommentar && kommentar.length > MAX_KOMMENTAR_LENGTH) {
    return { error: `Kommentar darf höchstens ${MAX_KOMMENTAR_LENGTH} Zeichen lang sein.` };
  }

  if (await isRateLimited(supabase, "route_ratings", "erstellt_am", "user_id", user.id, RATING_COOLDOWN_MS)) {
    return { error: "Bitte warte einen Moment, bevor du erneut bewertest." };
  }

  const { error } = await supabase
    .from("route_ratings")
    .upsert(
      // Beide Felder werden immer geschrieben, auch wenn eines null ist: das
      // Formular trägt den vollständigen Stand der eigenen Bewertung (die
      // Sternwahl ist mit dem gespeicherten Wert vorbelegt). Nur das
      // jeweils gefüllte zu schreiben hiesse, dass sich eine einmal
      // vergebene Wertung nie wieder auf "nur Kommentar" zurücknehmen
      // liesse.
      { route_id: routeId, user_id: user.id, kommentar, sterne },
      { onConflict: "route_id,user_id" },
    );

  if (error) {
    // Race-freie Durchsetzung via DB-Trigger (0024, erweitert in 0041 auf
    // Updates) — der App-seitige Check oben ist nur ein schnelles
    // Vorab-Feedback und kann bei parallelen Requests oder beim Bearbeiten
    // eines bestehenden Kommentars (upsert → UPDATE statt INSERT)
    // theoretisch durchrutschen.
    if (error.message.includes("cooldown_active")) {
      return { error: "Bitte warte einen Moment, bevor du erneut bewertest." };
    }
    // Der Constraint aus 0095. Erreichbar nur, wenn sterneLesen() und die
    // Datenbank auseinanderlaufen — dann ist die Meldung hier der Hinweis
    // darauf, und nicht ein generisches "konnte nicht gespeichert werden".
    if (error.message.includes("route_ratings_sterne_check")) {
      return { error: "Ungültige Wertung. Bitte lade die Seite neu." };
    }
    return { error: "Bewertung konnte nicht gespeichert werden." };
  }

  revalidatePath(`/strecken/${routeId}`);
  return { error: null, gespeichert: true };
}

export interface DeleteRatingState {
  error: string | null;
}

// Eigenen Kommentar löschen. Die RLS-Policy "Nutzer verwalten eigene
// Bewertungen" (0001, präzisiert in 0027) deckt DELETE bereits ab; der
// user_id-Filter hier ist die zweite Schranke (Defense-in-Depth, gleiches
// Muster wie deleteVehicle in lib/actions/vehicles.ts).
//
// Der Vorab-Lookup hat zwei Aufgaben: Er liefert die route_id für
// revalidatePath, und er trennt "gibt es nicht (mehr)" von "gehört dir
// nicht". Nach dem DELETE wäre beides nicht mehr unterscheidbar — RLS
// filtert die Zeile still heraus, Supabase meldet keinen Fehler, und ein
// abgelehnter Löschversuch sähe aus wie ein erfolgreicher.
export async function deleteRating(ratingId: string): Promise<DeleteRatingState> {
  if (!isValidUuid(ratingId)) return { error: "Kommentar nicht gefunden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const { data: vorhanden } = await supabase
    .from("route_ratings")
    .select("route_id")
    .eq("id", ratingId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!vorhanden) return { error: "Kommentar nicht gefunden." };

  const { error } = await supabase
    .from("route_ratings")
    .delete()
    .eq("id", ratingId)
    .eq("user_id", user.id);

  if (error) return { error: "Kommentar konnte nicht gelöscht werden." };

  revalidatePath(`/strecken/${vorhanden.route_id}`);
  return { error: null };
}
