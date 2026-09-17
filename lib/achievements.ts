import { createClient } from "@/lib/supabase/server";
import { summiereHoehenmeter } from "@/lib/hoehenmeter";
import { mitAnzahl } from "@/lib/format";

export const PASS_MILESTONES = [1, 5, 10, 25, 50, 100];
export const HOEHENMETER_MILESTONES = [1000, 5000, 10000, 25000, 50000];
export const FAHRTEN_MILESTONES = [1, 10, 25, 50, 100];

export function highestMilestone(value: number, milestones: number[]): number | null {
  const reached = milestones.filter((m) => value >= m);
  return reached.length > 0 ? reached[reached.length - 1] : null;
}

export interface AchievementStats {
  passCount: number;
  hoehenmeter: number;
  fahrtenCount: number;
}

// Dieselbe Aggregation wie die Statistiken-Kachelreihe in app/profil/page.tsx
// (Pässe dedupliziert pro Strecke, Höhenmeter als kumulierter Anstieg über
// dieselben Fahrten, die auch "Anzahl Fahrten" zählt), hier separat abrufbar
// für Stellen, die nicht die ganze Profilseite laden — z.B. das Teilen-Bild
// einer einzelnen Fahrt (app/fahrten/[id]/page.tsx). Beide Stellen müssen
// dieselbe Zahl zeigen: das Abzeichen auf dem geteilten Bild behauptet einen
// Meilenstein, den das eigene Profil sonst nicht bestätigt.
export async function getUserAchievementStats(userId: string): Promise<AchievementStats> {
  const supabase = await createClient();
  const [{ data: streckenFahrten }, { data: fahrten, count: fahrtenCount }] = await Promise.all([
    supabase
      .from("route_completions")
      .select("route_id")
      .eq("user_id", userId)
      .eq("art", "strecke")
      .returns<{ route_id: string }[]>(),
    // hoehenmeter_aufstieg statt eines Joins auf routes(hoehe_m): der
    // kumulierte Anstieg hängt an der Fahrt, nicht an der Strecke, und gilt
    // deshalb auch für freie Fahrten. Siehe lib/hoehenmeter.ts.
    //
    // .is("parent_completion_id", null) wie in app/profil/page.tsx, und aus
    // demselben Grund: die aus einer freien Fahrt erkannten Abschnitte
    // (0050/0081) sind eigene Zeilen mit eigener Distanz. Ohne den Filter
    // zählte eine Ausfahrt über drei erkannte Strecken als vier Fahrten.
    // Die Höhenmeter waren nie betroffen — Abschnitte tragen dort null
    // (der INSERT in 0081 setzt die Spalte gar nicht), und
    // summiereHoehenmeter überspringt null. Der Filter deckt sie
    // trotzdem mit ab, damit er auch dann noch stimmt, wenn sich das
    // einmal ändert.
    //
    // Die Pässe-Abfrage darüber bleibt ohne den Filter — dort sollen die
    // Abschnitte zählen. Die beiden Abfragen beschreiben absichtlich
    // unterschiedliche Mengen; das ist keine Unachtsamkeit, sondern die
    // Regel: "welche Strecken habe ich befahren" schliesst Abschnitte ein,
    // "wie viel bin ich gefahren" nicht.
    //
    // Diese Funktion speist auch das Abzeichen auf dem Teilen-Bild
    // (app/fahrten/[id]/page.tsx). Der Kopf oben verlangt, dass sie
    // dieselbe Zahl liefert wie die Profilseite — ohne diesen Filter tat
    // sie das zwar auch, aber beide waren gleich falsch.
    supabase
      .from("route_completions")
      .select("hoehenmeter_aufstieg", { count: "exact" })
      .eq("user_id", userId)
      .not("dauer_sekunden", "is", null)
      .is("parent_completion_id", null)
      .returns<{ hoehenmeter_aufstieg: number | null }[]>(),
  ]);

  return {
    passCount: new Set((streckenFahrten ?? []).map((c) => c.route_id)).size,
    hoehenmeter: summiereHoehenmeter(fahrten ?? []),
    fahrtenCount: fahrtenCount ?? 0,
  };
}

// Für das Teilen-Bild reicht ein einzelner, prominent gezeigter Meilenstein
// statt der ganzen Badge-Reihe. Pässe zuerst, dann Höhenmeter, dann Fahrten —
// eine feste Priorität statt eines Vergleichs über unterschiedliche Einheiten
// hinweg (Pässe vs. Meter vs. Fahrten lassen sich nicht sinnvoll der Grösse
// nach sortieren). Zeigt den aktuell höchsten erreichten Stand, nicht
// zwingend einen gerade eben neu erreichten — es gibt aktuell keine
// Vorher/Nachher-Erkennung einzelner Fahrten.
export function featuredMilestone(stats: AchievementStats): string | null {
  const pass = highestMilestone(stats.passCount, PASS_MILESTONES);
  if (pass !== null) return `${mitAnzahl(pass, "Pass", "Pässe")} befahren`;

  const hoehenmeter = highestMilestone(stats.hoehenmeter, HOEHENMETER_MILESTONES);
  if (hoehenmeter !== null) return `${hoehenmeter.toLocaleString("de-CH")} Höhenmeter`;

  const fahrten = highestMilestone(stats.fahrtenCount, FAHRTEN_MILESTONES);
  if (fahrten !== null) return mitAnzahl(fahrten, "Fahrt", "Fahrten");

  return null;
}
