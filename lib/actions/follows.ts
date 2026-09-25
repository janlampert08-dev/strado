"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";
import type { FolgeZustand } from "@/lib/follows";

const FOLLOW_COOLDOWN_MS = 500;

// Ein Knopf, drei Zustände (0146): folgt → entfolgen; angefragt → Anfrage
// zurückziehen; keiner → folgen, oder eine Anfrage stellen, wenn das Profil
// Follower bestätigt. Selbst-Folgen verhindern zusätzlich die Constraints
// follows_not_self (0030) und folge_anfragen_nicht_selbst (0146).
//
// Der Knopf schickt mit, von welchem Zustand er ausging (angezeigt). Stimmt
// der mit der Datenbank nicht überein — die Anfrage wurde inzwischen
// angenommen oder abgelehnt, man folgt schon aus einem anderen Tab —, wird
// NICHTS geschrieben und der tatsächliche Stand zurückgegeben. Ein blindes
// Umschalten täte sonst das Gegenteil des Getippten; und seit den
// Folgeanfragen lässt sich ein versehentliches Entfolgen nur noch über eine
// neue Anfrage rückgängig machen.
//
// Ob angefragt statt gefolgt wird, entscheidet der Server mit derselben
// Regel wie die Policies (folgen_braucht_bestaetigung, 0146/0147).
export async function toggleFollow(
  targetUserId: string,
  angezeigt: FolgeZustand,
): Promise<{
  ok: boolean;
  // Der Stand danach, wie die Datenbank ihn sieht.
  zustand?: FolgeZustand;
  // false: der Knopf war veraltet, es wurde nichts geändert.
  geaendert?: boolean;
  // true: zu schnell hintereinander getippt (Sperre gegen Skripte).
  gebremst?: boolean;
  // Die Regel des Profils, wie sie jetzt gilt — der Knopf kennt sie sonst
  // nur vom Laden der Seite.
  brauchtBestaetigung?: boolean;
}> {
  if (!isValidUuid(targetUserId)) return { ok: false };
  if (angezeigt !== "folgt" && angezeigt !== "angefragt" && angezeigt !== "keiner") {
    return { ok: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id === targetUserId) return { ok: false };

  // Alles, was vor dem Schreiben gelesen werden muss, in einem Zug. Beide
  // Tabellen für die Sperre: Anfragen legen keine follows-Zeile an.
  const [folgenGesperrt, anfragenGesperrt, folgtLesen, anfrageLesen, regel] =
    await Promise.all([
      isRateLimited(supabase, "follows", "erstellt_am", "follower_id", user.id, FOLLOW_COOLDOWN_MS),
      isRateLimited(supabase, "folge_anfragen", "erstellt_am", "von", user.id, FOLLOW_COOLDOWN_MS),
      supabase
        .from("follows")
        .select("followed_id")
        .eq("follower_id", user.id)
        .eq("followed_id", targetUserId)
        .maybeSingle(),
      supabase
        .from("folge_anfragen")
        .select("an")
        .eq("von", user.id)
        .eq("an", targetUserId)
        .maybeSingle(),
      supabase.rpc("folgen_braucht_bestaetigung", { p_ziel: targetUserId }),
    ]);
  // Ein Lesefehler ist kein "keine Zeile": sonst meldete der Knopf "du
  // folgst nicht mehr", während die Beziehung weiter besteht.
  if (folgtLesen.error || anfrageLesen.error || regel.error) return { ok: false };
  if (folgenGesperrt || anfragenGesperrt) return { ok: false, gebremst: true };
  const folgt = folgtLesen.data;
  const anfrage = anfrageLesen.data;

  const brauchtBestaetigung = regel.data === true;
  const vorher: FolgeZustand = folgt ? "folgt" : anfrage ? "angefragt" : "keiner";

  if (vorher !== angezeigt) {
    return { ok: true, zustand: vorher, geaendert: false, brauchtBestaetigung };
  }

  let zustand: FolgeZustand;
  if (vorher === "folgt") {
    const { error, count } = await supabase
      .from("follows")
      .delete({ count: "exact" })
      .eq("follower_id", user.id)
      .eq("followed_id", targetUserId);
    if (error) return { ok: false };
    // 0 Zeilen: der Gefolgte hat einen inzwischen entfernt.
    if (count === 0) return { ok: true, zustand: "keiner", geaendert: false, brauchtBestaetigung };
    zustand = "keiner";
  } else if (vorher === "angefragt") {
    const { error, count } = await supabase
      .from("folge_anfragen")
      .delete({ count: "exact" })
      .eq("von", user.id)
      .eq("an", targetUserId);
    if (error) return { ok: false };
    // 0 Zeilen: die Anfrage wurde gerade beantwortet — angenommen (dann folgt
    // man jetzt) oder abgelehnt. Den echten Stand nachlesen statt
    // "zurückgezogen" zu melden.
    if (count === 0) {
      const { data: jetzt, error: nachlesen } = await supabase
        .from("follows")
        .select("followed_id")
        .eq("follower_id", user.id)
        .eq("followed_id", targetUserId)
        .maybeSingle();
      if (nachlesen) return { ok: false };
      return {
        ok: true,
        zustand: jetzt ? "folgt" : "keiner",
        geaendert: false,
        brauchtBestaetigung,
      };
    }
    zustand = "keiner";
  } else if (brauchtBestaetigung) {
    const { error } = await supabase
      .from("folge_anfragen")
      .insert({ von: user.id, an: targetUserId });
    if (error) return { ok: false };
    zustand = "angefragt";
  } else {
    const { error } = await supabase
      .from("follows")
      .insert({ follower_id: user.id, followed_id: targetUserId });
    if (error) return { ok: false };
    zustand = "folgt";
  }

  revalidatePath(`/fahrer/${targetUserId}`);
  revalidatePath("/feed");
  // Der Aktivitäts-Rückkanal des Gefolgten (Kernloop-Schritt 8) und der
  // Ungelesen-Zähler im Header hängen an dieser Beziehung — beim Entfolgen
  // genauso wie beim Folgen: die Meldung wird aus der follows-Zeile
  // abgeleitet (0100) und verschwindet mit ihr wieder. Offene Anfragen
  // stehen seit 0146 ebenfalls dort.
  revalidatePath("/aktivitaet");
  return { ok: true, zustand, geaendert: true, brauchtBestaetigung };
}

// Einen eigenen Follower entfernen (0149). Wichtig für Fahrten "nur für
// Follower": wer vor den Folgeanfragen (0146) gefolgt ist, brauchte keine
// Bestätigung — so lässt sich der Kreis nachträglich schliessen.
export async function followerEntfernen(followerId: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(followerId)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === followerId) return { ok: false };

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followed_id", user.id);
  if (error) return { ok: false };
  // 0 Zeilen: die Person folgt schon nicht mehr (selbst entfolgt) — das Ziel
  // ist erreicht, die Liste soll den Eintrag nicht zurückholen.

  revalidatePath("/profil");
  revalidatePath(`/fahrer/${user.id}`);
  revalidatePath(`/fahrer/${followerId}`);
  revalidatePath("/feed");
  return { ok: true };
}

// Annehmen: aus der Anfrage wird eine follows-Zeile. Läuft über
// folgeanfrage_annehmen (SECURITY DEFINER, 0146), weil die Zeile dem
// Anfragenden gehört — die Funktion setzt nur Anfragen an den Aufrufer um.
export async function folgeanfrageAnnehmen(vonUserId: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(vonUserId)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data, error } = await supabase.rpc("folgeanfrage_annehmen", { p_von: vonUserId });
  if (error || data !== true) return { ok: false };

  revalidatePath("/aktivitaet");
  revalidatePath(`/fahrer/${user.id}`);
  revalidatePath(`/fahrer/${vonUserId}`);
  return { ok: true };
}

// Ablehnen ist Löschen; RLS lässt nur Anfragen zu, an denen man beteiligt
// ist (0146), der an-Filter hält es auf die an einen selbst gerichteten.
export async function folgeanfrageAblehnen(vonUserId: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(vonUserId)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("folge_anfragen")
    .delete()
    .eq("von", vonUserId)
    .eq("an", user.id);
  if (error) return { ok: false };

  revalidatePath("/aktivitaet");
  revalidatePath(`/fahrer/${vonUserId}`);
  return { ok: true };
}
