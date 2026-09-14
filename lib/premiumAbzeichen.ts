import { createClient } from "@/lib/supabase/server";

// Wer trägt das Premium-Abzeichen hinter dem Namen?
//
// Batch-Read für eine Liste von Konten, nach dem Muster von
// getKudosForCompletions (lib/kudos.ts): eine Abfrage für eine ganze
// Feed-Seite statt einer pro Zeile.
//
// ---------------------------------------------------------------------------
// Warum eine zweite Abfrage und nicht eine Spalte in public_fahrten
// ---------------------------------------------------------------------------
// public_fahrten führt display_name und avatar_url bereits mit (0030), das
// Abzeichen liesse sich also naheliegend danebenlegen. Zwei Gründe dagegen:
//
// 1. Die View müsste dafür neu geschrieben werden. Sie ist geschützter
//    Bereich, wird vom Feed, vom öffentlichen Profil und von den
//    Fahrt-Detailseiten gelesen, und ihre letzte vollständige Definition
//    steht in 0070 — ein "create or replace" müsste sie fehlerfrei
//    reproduzieren. Das ist ein Risiko, das ein Abzeichen nicht wert ist.
// 2. Die View bliebe damit dauerhaft eine Stelle, an der ein Premium-Bezug
//    mitläuft. Ohne die Spalte gibt public_fahrten über den Abo-Status gar
//    nichts preis — die konservativere Lage, und sie kostet hier eine
//    einzige zusätzliche Abfrage auf höchstens 30 Konten.
//
// ---------------------------------------------------------------------------
// Warum zeigt_premium_abzeichen und nicht ist_premium
// ---------------------------------------------------------------------------
// Weil ist_premium der rohe Abo-Status ist und das Opt-in nicht kennt. Die
// Verknüpfung fällt in der Datenbank (generierte Spalte, 0087) — hier wird
// sie nur gelesen. Wer an dieser Stelle zwei Spalten selbst verknüpft, hat
// den Sinn der Spalte verfehlt: dann stünde der Abo-Status wieder in einer
// Abfrage, die ihn nicht braucht.
//
// Ein Konto ohne Zeile (gelöscht, oder für den Aufrufer per RLS unsichtbar)
// fehlt im Ergebnis und trägt damit kein Abzeichen — das Fehlen einer
// Antwort darf nie zu einem gesetzten Abzeichen führen.
export async function getPremiumAbzeichen(userIds: string[]): Promise<Set<string>> {
  const mitAbzeichen = new Set<string>();
  const eindeutig = [...new Set(userIds)];
  if (eindeutig.length === 0) return mitAbzeichen;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, zeigt_premium_abzeichen")
    .in("id", eindeutig)
    .eq("zeigt_premium_abzeichen", true);

  for (const zeile of data ?? []) {
    mitAbzeichen.add(zeile.id);
  }

  return mitAbzeichen;
}

// Einzelfall — dieselbe Frage für ein Konto, etwa auf einer
// Fahrt-Detailseite. Bewusst über denselben Weg statt über eine eigene
// Abfrage, damit es nur eine Stelle gibt, die weiss, welche Spalte gilt.
export async function hatPremiumAbzeichen(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  return (await getPremiumAbzeichen([userId])).has(userId);
}
