"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { istPremium } from "@/lib/premium";
import { isRateLimited } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";
import { todayInZurich } from "@/lib/format";
import { erinnerungenLeer, pruefeEintrag, pruefeErinnerungen } from "@/lib/wartung";

// Schreibpfade des Wartungshefts (0111_wartungsheft.sql).
//
// Die Gating-Regel, an drei Stellen gleich:
//   * Anlegen und Ändern verlangen ein laufendes Abo — hier über
//     istPremium() UND in der RLS-Policy. Die Policy ist die Schranke (sie
//     gilt auch für einen direkten PostgREST-Request), der Check hier ist
//     der verständliche Satz statt eines rohen Datenbankfehlers.
//   * Löschen verlangt es NICHT. Wer sein Abo beendet, behält seine
//     Einträge und darf sie wegräumen — es sind seine Daten.
//
// Jede Aktion prüft zusätzlich zum RLS selbst, dass das Fahrzeug bzw. der
// Eintrag dem angemeldeten Konto gehört. Ohne diesen Vorab-Check ginge ein
// durch RLS blockiertes UPDATE/DELETE (0 betroffene Zeilen, kein Fehler)
// als Erfolg durch — dieselbe Falle, die deleteVehicle() beschreibt.

export interface WartungFormState {
  error: string | null;
  /** Für den Dialog: geschlossen wird erst, wenn das Speichern durch ist. */
  erfolg?: boolean;
}

const EINTRAG_COOLDOWN_MS = 2000;
const NICHT_ANGEMELDET = "Bitte melde dich zuerst an.";
const KEIN_PREMIUM =
  "Einträge und Erinnerungen im Wartungsheft gehören zu Premium. Lesen und löschen kannst du deine Einträge weiterhin.";
const FAHRZEUG_FEHLT = "Fahrzeug nicht gefunden.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function eigenesFahrzeug(supabase: Supabase, userId: string, fahrzeugId: string): Promise<boolean> {
  if (!isValidUuid(fahrzeugId)) return false;
  const { data } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", fahrzeugId)
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

function feld(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

export async function addWartungseintrag(
  _prevState: WartungFormState,
  formData: FormData,
): Promise<WartungFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NICHT_ANGEMELDET };

  const fahrzeugId = feld(formData, "fahrzeug_id");
  if (!(await eigenesFahrzeug(supabase, user.id, fahrzeugId))) return { error: FAHRZEUG_FEHLT };

  if (!(await istPremium())) return { error: KEIN_PREMIUM };

  const geprueft = pruefeEintrag(
    {
      art: feld(formData, "art"),
      datum: feld(formData, "datum"),
      km_stand: feld(formData, "km_stand"),
      kosten_chf: feld(formData, "kosten_chf"),
      notiz: feld(formData, "notiz"),
    },
    todayInZurich(),
  );
  if (!geprueft.ok) return { error: geprueft.fehler };

  if (
    await isRateLimited(
      supabase,
      "wartungseintraege",
      "created_at",
      "user_id",
      user.id,
      EINTRAG_COOLDOWN_MS,
    )
  ) {
    return { error: "Bitte warte einen Moment, bevor du den nächsten Eintrag speicherst." };
  }

  const { error } = await supabase.from("wartungseintraege").insert({
    fahrzeug_id: fahrzeugId,
    user_id: user.id,
    ...geprueft.wert,
  });

  if (error) {
    console.error("Wartungseintrag konnte nicht gespeichert werden:", error.message);
    return { error: "Eintrag konnte nicht gespeichert werden." };
  }

  revalidatePath(`/profil/fahrzeuge/${fahrzeugId}`);
  revalidatePath("/profil");
  return { error: null, erfolg: true };
}

export async function updateWartungseintrag(
  _prevState: WartungFormState,
  formData: FormData,
): Promise<WartungFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NICHT_ANGEMELDET };

  const id = feld(formData, "id");
  if (!isValidUuid(id)) return { error: "Eintrag nicht gefunden." };

  if (!(await istPremium())) return { error: KEIN_PREMIUM };

  const geprueft = pruefeEintrag(
    {
      art: feld(formData, "art"),
      datum: feld(formData, "datum"),
      km_stand: feld(formData, "km_stand"),
      kosten_chf: feld(formData, "kosten_chf"),
      notiz: feld(formData, "notiz"),
    },
    todayInZurich(),
  );
  if (!geprueft.ok) return { error: geprueft.fehler };

  // Das Fahrzeug kommt aus der Datenbank, nicht aus dem Formular: ein
  // Eintrag wechselt sein Fahrzeug nie (der Spalten-Grant für UPDATE lässt
  // es auch gar nicht zu), und der Pfad für revalidatePath soll nicht von
  // einem mitgeschickten Wert abhängen.
  const { data: vorhanden } = await supabase
    .from("wartungseintraege")
    .select("id, fahrzeug_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; fahrzeug_id: string }>();
  if (!vorhanden) return { error: "Eintrag nicht gefunden." };

  const { error } = await supabase
    .from("wartungseintraege")
    .update(geprueft.wert)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Wartungseintrag konnte nicht geändert werden:", error.message);
    return { error: "Eintrag konnte nicht geändert werden." };
  }

  revalidatePath(`/profil/fahrzeuge/${vorhanden.fahrzeug_id}`);
  revalidatePath("/profil");
  return { error: null, erfolg: true };
}

export async function deleteWartungseintrag(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NICHT_ANGEMELDET };

  if (!isValidUuid(id)) return { error: "Eintrag nicht gefunden." };

  const { data: vorhanden } = await supabase
    .from("wartungseintraege")
    .select("id, fahrzeug_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; fahrzeug_id: string }>();
  if (!vorhanden) return { error: "Eintrag nicht gefunden." };

  // Ohne Premium-Prüfung, mit Absicht: siehe Dateikopf.
  const { error } = await supabase
    .from("wartungseintraege")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Wartungseintrag konnte nicht entfernt werden:", error.message);
    return { error: "Eintrag konnte nicht entfernt werden." };
  }

  revalidatePath(`/profil/fahrzeuge/${vorhanden.fahrzeug_id}`);
  revalidatePath("/profil");
  return { error: null };
}

export async function speichereWartungserinnerungen(
  _prevState: WartungFormState,
  formData: FormData,
): Promise<WartungFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NICHT_ANGEMELDET };

  const fahrzeugId = feld(formData, "fahrzeug_id");
  if (!(await eigenesFahrzeug(supabase, user.id, fahrzeugId))) return { error: FAHRZEUG_FEHLT };

  if (!(await istPremium())) return { error: KEIN_PREMIUM };

  const geprueft = pruefeErinnerungen(
    {
      naechste_mfk_am: feld(formData, "naechste_mfk_am"),
      service_intervall_km: feld(formData, "service_intervall_km"),
      service_intervall_monate: feld(formData, "service_intervall_monate"),
    },
    todayInZurich(),
  );
  if (!geprueft.ok) return { error: geprueft.fehler };

  // Alles leer heisst "keine Erinnerungen mehr": die Zeile geht weg, statt
  // als Zeile mit drei NULL-Werten stehen zu bleiben.
  if (erinnerungenLeer(geprueft.wert)) {
    const { error } = await supabase
      .from("wartungserinnerungen")
      .delete()
      .eq("fahrzeug_id", fahrzeugId)
      .eq("user_id", user.id);
    if (error) {
      console.error("Wartungserinnerungen konnten nicht entfernt werden:", error.message);
      return { error: "Erinnerungen konnten nicht gespeichert werden." };
    }
    revalidatePath(`/profil/fahrzeuge/${fahrzeugId}`);
    revalidatePath("/profil");
    return { error: null, erfolg: true };
  }

  // Bewusst Update-dann-Insert statt upsert(): ein PostgREST-Upsert
  // schreibt beim Konflikt ALLE mitgeschickten Spalten, also auch
  // fahrzeug_id und user_id — und für die gibt 0111 absichtlich kein
  // UPDATE-Recht her (ein Eintrag soll das Fahrzeug nicht wechseln können).
  const { data: vorhanden } = await supabase
    .from("wartungserinnerungen")
    .select("fahrzeug_id")
    .eq("fahrzeug_id", fahrzeugId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = vorhanden
    ? await supabase
        .from("wartungserinnerungen")
        .update(geprueft.wert)
        .eq("fahrzeug_id", fahrzeugId)
        .eq("user_id", user.id)
    : await supabase
        .from("wartungserinnerungen")
        .insert({ fahrzeug_id: fahrzeugId, user_id: user.id, ...geprueft.wert });

  if (error) {
    console.error("Wartungserinnerungen konnten nicht gespeichert werden:", error.message);
    return { error: "Erinnerungen konnten nicht gespeichert werden." };
  }

  revalidatePath(`/profil/fahrzeuge/${fahrzeugId}`);
  revalidatePath("/profil");
  return { error: null, erfolg: true };
}
