import { createClient } from "@/lib/supabase/server";
import { MOTORKLASSEN } from "@/lib/motorklassen";
import type { Motorklasse } from "@/types/database";

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: number;
}

// Zeilenform von public.leaderboard_user_totals (0054_leaderboard_user_totals.sql)
// — bereits serverseitig pro Nutzer aggregiert (eine Zeile pro Nutzer statt
// pro Fahrt), damit getGlobalLeaderboards() unten nicht mehr die komplette
// Fahrtenhistorie der Plattform laden und selbst summieren muss.
export interface LeaderboardUserTotalsRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  fahrten_count: number;
  // Summe von hoehenmeter_aufstieg (kumulierter Anstieg aus dem GPS-Track)
  // über alle Fahrten des Nutzers, freie wie Streckenfahrten. Vor
  // 0056_freie_fahrten_in_bestenlisten.sql war das die Scheitelhöhe der
  // gefahrenen Strecken (routes.hoehe_m) und liess sich für freie Fahrten
  // nicht bilden.
  hoehenmeter: number;
  km: number;
  strecken_count: number;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const TOP_N = 3;

// Exportiert für lib/leaderboard.test.ts — die eigentliche Summierung/
// Deduplizierung läuft seit 0054_leaderboard_user_totals.sql serverseitig in
// der View, hier bleibt nur noch die Zeile-zu-LeaderboardEntry-Abbildung als
// reine, unit-testbare Funktion übrig.
export function toEntry(row: LeaderboardUserTotalsRow, value: number): LeaderboardEntry {
  return {
    userId: row.user_id,
    name: row.display_name ?? "Anonym",
    // avatar_url kommt bereits serverseitig mit dem zeigt_avatar-Opt-in
    // verrechnet aus der View (siehe 0028_leaderboard_avatar.sql) — hier
    // nur noch durchgereicht, keine weitere Prüfung nötig.
    avatarUrl: row.avatar_url,
    value,
  };
}

// Holt direkt die Top TOP_N Nutzer für eine Metrik — sortiert und begrenzt
// die Datenbank selbst (order/limit), statt die komplette Tabelle zu laden
// und in JS zu sortieren.
//
// Ohne Klasse kommt die Gesamtwertung aus leaderboard_user_totals (eine
// Zeile pro Nutzer), mit Klasse aus leaderboard_klassen_totals (eine Zeile
// pro Nutzer UND Klasse, 0080). Zwei Views statt einer, weil jemand mit
// Auto und Motorrad sonst in der Gesamtwertung doppelt erschiene und "Alle"
// keine Gesamtsumme mehr wäre.
async function topByMetric(
  supabase: SupabaseClient,
  metric: "fahrten_count" | "hoehenmeter" | "km" | "strecken_count",
  klasse?: Motorklasse | null,
): Promise<LeaderboardEntry[]> {
  const spalten =
    "user_id, display_name, avatar_url, fahrten_count, hoehenmeter, km, strecken_count";

  const query = klasse
    ? supabase.from("leaderboard_klassen_totals").select(spalten).eq("motorklasse", klasse)
    : supabase.from("leaderboard_user_totals").select(spalten);

  const { data, error } = await query
    .order(metric, { ascending: false, nullsFirst: false })
    .limit(TOP_N);

  if (error || !data) return [];

  return (data as LeaderboardUserTotalsRow[]).map((row) => toEntry(row, row[metric]));
}

// Vier bewusst nicht-zeitbezogene Bestenlisten (siehe 0013_leaderboard_view.sql
// für die Begründung) — belohnen Distanz/Höhenmeter/Anzahl aufgezeichneter
// Fahrten/unterschiedlicher Strecken, nie Geschwindigkeit. "Entdecker"
// (strecken_count) zählt unterschiedliche Strecken statt reiner Fahrtenzahl
// — belohnt Vielfalt auch für Nutzer, die nie an die Spitze der
// Distanz-/Höhenmeter-Rangliste kommen. Bewusst ohne Zeitfenster:
// leaderboard_completions liefert kein Datum; ein Rolling-Window wäre eine
// eigene View-Änderung und ist nicht Teil dieser Phase.
//
// Mit einer Motorklasse (0080) zählen nur Fahrten dieser Klasse; ohne bleibt
// es die Gesamtwertung über alles, also genau die Liste von vor der
// Einführung der Klassen. "Alle" ist damit die Voreinstellung, und niemand
// verliert eine Rangliste, in der er gerade vorne steht.
//
// Seit 0056_freie_fahrten_in_bestenlisten.sql zählen auch freie Fahrten
// (art = 'frei') in fahrten_count/hoehenmeter/km mit — vorher (0044) waren
// die vier Listen ausschliesslich streckenbasiert. strecken_count bleibt
// unverändert streckenbasiert: count(distinct route_id) in
// leaderboard_user_totals ignoriert NULL-route_id (freie Fahrten) von
// selbst, ohne eigenen Filter.
export async function getGlobalLeaderboards(klasse?: Motorklasse | null): Promise<{
  meisteFahrten: LeaderboardEntry[];
  meisteHoehenmeter: LeaderboardEntry[];
  meisteKm: LeaderboardEntry[];
  meisteStrecken: LeaderboardEntry[];
}> {
  const supabase = await createClient();

  // Vier unabhängige, jeweils auf TOP_N Zeilen begrenzte Abfragen statt
  // einer einzigen "alles laden"-Abfrage — parallel gestartet.
  const [meisteFahrten, meisteHoehenmeter, meisteKm, meisteStrecken] = await Promise.all([
    topByMetric(supabase, "fahrten_count", klasse),
    topByMetric(supabase, "hoehenmeter", klasse),
    topByMetric(supabase, "km", klasse),
    topByMetric(supabase, "strecken_count", klasse),
  ]);

  return { meisteFahrten, meisteHoehenmeter, meisteKm, meisteStrecken };
}

export interface RouteTimeEntry {
  completionId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  dauerSekunden: number;
  // Die gewertete Motorklasse (0080). null für Fahrten, deren Fahrzeug keine
  // Leistungsangabe trägt oder die vor der Einführung entstanden sind — die
  // erscheinen weiterhin in "Alle", aber in keiner Klassenliste.
  klasse: Motorklasse | null;
}

export interface RouteLeaderboardRow {
  completion_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  dauer_sekunden: number;
  motorklasse: Motorklasse | null;
}

const ROUTE_TOP_N = 10;

// route_leaderboard liefert eine Zeile pro opted-in Fahrt, nicht pro Nutzer —
// wir holen daher deutlich mehr Zeilen als ROUTE_TOP_N und deduplizieren in JS
// auf die schnellste Fahrt pro Nutzer (siehe dedupeRouteLeaderboardRows), statt
// mehrere Zeiten desselben Fahrers in der Bestenliste zuzulassen.
const ROUTE_FETCH_LIMIT = 200;

// Reine Reduktion (kein DB-Zugriff), daher separat testbar: pro user_id nur
// die schnellste Fahrt behalten und auf die Top N unterschiedlichen Nutzer
// kürzen. Setzt voraus, dass rows bereits aufsteigend nach dauer_sekunden
// sortiert sind — das erste Vorkommen eines Nutzers ist dann seine Bestzeit.
export function dedupeRouteLeaderboardRows(
  rows: RouteLeaderboardRow[],
  topN: number,
): RouteLeaderboardRow[] {
  const seenUsers = new Set<string>();
  const result: RouteLeaderboardRow[] = [];

  for (const row of rows) {
    if (seenUsers.has(row.user_id)) continue;
    seenUsers.add(row.user_id);
    result.push(row);
    if (result.length >= topN) break;
  }

  return result;
}

// Nur Fahrten mit aktivem Opt-in (route_leaderboard-View, siehe
// 0014_route_leaderboard_optin.sql) — sortiert nach kürzester Zeit.
//
// klasse filtert auf eine Motorklasse (0080). Die View führt dafür
// motorklasse_gewertet, nicht die deklarierte Klasse: gewertet wird die
// höhere aus Angabe und dem, was der Track belegt. Ohne klasse bleibt die
// Liste wie bisher — "Alle" ist die Voreinstellung, niemand verliert eine
// Rangliste, in der er gerade vorne steht.
//
// Die Deduplizierung auf die schnellste Fahrt pro Nutzer läuft NACH dem
// Filter: wer seine Bestzeit im Porsche und eine langsamere auf dem Roller
// gefahren ist, soll in der Rollerklasse mit der Rollerzeit erscheinen und
// nicht gar nicht.
export async function getRouteLeaderboard(
  routeId: string,
  klasse?: Motorklasse | null,
): Promise<RouteTimeEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("route_leaderboard")
    .select("completion_id, user_id, display_name, avatar_url, dauer_sekunden, motorklasse")
    .eq("route_id", routeId);

  if (klasse) query = query.eq("motorklasse", klasse);

  const { data, error } = await query
    .order("dauer_sekunden", { ascending: true })
    .limit(ROUTE_FETCH_LIMIT);

  if (error || !data) return [];

  const deduped = dedupeRouteLeaderboardRows(data as RouteLeaderboardRow[], ROUTE_TOP_N);

  return deduped.map((r) => ({
    completionId: r.completion_id,
    userId: r.user_id,
    name: r.display_name ?? "Anonym",
    // Bereits serverseitig mit zeigt_avatar verrechnet (0028_leaderboard_avatar.sql).
    avatarUrl: r.avatar_url,
    dauerSekunden: r.dauer_sekunden,
    klasse: r.motorklasse,
  }));
}

// Welche Motorklassen auf dieser Strecke überhaupt geteilte Zeiten haben —
// für die Chip-Leiste. Global sind alle sechs Klassen sichtbar (ein leerer
// Zustand lädt zum Mitmachen ein), pro Strecke wären fünf leere Chips nur
// Rauschen.
//
// Je Katalogklasse eine Existenzabfrage mit limit(1), parallel — nicht ein
// Ausschnitt über alle Zeiten der Strecke. Der naheliegende Weg (einmal
// motorklasse über die ganze View holen und in JS zusammenfassen) braucht
// ein limit, weil PostgREST kein DISTINCT kennt, und die View gibt keine
// Reihenfolge vor: Bei einer Strecke mit mehr geteilten Zeiten als dem
// Limit könnte eine belegte Klasse ausserhalb des Ausschnitts liegen. Ihr
// Chip fehlte dann, und ihre Rangliste wäre über die Oberfläche gar nicht
// mehr erreichbar — ein Fehler, der erst bei einer beliebten Strecke
// auftritt und dort still bleibt.
//
// Sechs Abfragen klingen nach viel und sind es nicht: jede liest höchstens
// eine Zeile über den Index aus 0080 (route_id, motorklasse_gewertet,
// dauer_sekunden), und sie laufen gemeinsam. Die Zahl ist durch den Katalog
// fest begrenzt, nicht durch die Datenmenge.
//
// Die Reihenfolge entspricht dem Katalog; MotorklassenChips sortiert
// ohnehin danach.
export async function getRouteLeaderboardKlassen(routeId: string): Promise<Motorklasse[]> {
  const supabase = await createClient();

  const treffer = await Promise.all(
    MOTORKLASSEN.map(async (klasse) => {
      const { data, error } = await supabase
        .from("route_leaderboard")
        .select("motorklasse")
        .eq("route_id", routeId)
        .eq("motorklasse", klasse.id)
        .limit(1);

      return !error && data && data.length > 0 ? klasse.id : null;
    }),
  );

  return treffer.filter((klasse): klasse is Motorklasse => klasse !== null);
}
