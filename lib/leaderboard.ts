import { createClient } from "@/lib/supabase/server";

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: number;
  isPremiumBadge: boolean;
}

// Zeilenform von public.leaderboard_user_totals (0054_leaderboard_user_totals.sql)
// — bereits serverseitig pro Nutzer aggregiert (eine Zeile pro Nutzer statt
// pro Fahrt), damit getGlobalLeaderboards() unten nicht mehr die komplette
// Fahrtenhistorie der Plattform laden und selbst summieren muss.
export interface LeaderboardUserTotalsRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  ist_premium: boolean;
  zeigt_premium_badge: boolean;
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
    // Zwei Bedingungen, beide nötig: das Abo muss laufen UND das Abzeichen
    // muss selbst eingeschaltet sein (0021_premium_und_private_strecken.sql).
    // Das Opt-in ist der Grund, warum hier nicht einfach ist_premium steht —
    // wer zahlt, aber nicht auffallen will, bleibt unmarkiert.
    //
    // Endet ein Abo, fällt ist_premium weg und das Abzeichen verschwindet
    // von selbst; ein Aufräumen der Opt-in-Spalte ist dafür nicht nötig
    // (apply_subscription_state schaltet sie trotzdem ab, siehe 0059).
    isPremiumBadge: row.ist_premium === true && row.zeigt_premium_badge === true,
  };
}

// Holt direkt die Top TOP_N Nutzer für eine Metrik aus
// leaderboard_user_totals — sortiert und begrenzt die Datenbank selbst
// (order/limit), statt wie zuvor die komplette Tabelle zu laden und in JS
// zu sortieren.
async function topByMetric(
  supabase: SupabaseClient,
  metric: "fahrten_count" | "hoehenmeter" | "km" | "strecken_count",
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard_user_totals")
    .select(
      "user_id, display_name, avatar_url, ist_premium, zeigt_premium_badge, fahrten_count, hoehenmeter, km, strecken_count",
    )
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
// Seit 0056_freie_fahrten_in_bestenlisten.sql zählen auch freie Fahrten
// (art = 'frei') in fahrten_count/hoehenmeter/km mit — vorher (0044) waren
// die vier Listen ausschliesslich streckenbasiert. strecken_count bleibt
// unverändert streckenbasiert: count(distinct route_id) in
// leaderboard_user_totals ignoriert NULL-route_id (freie Fahrten) von
// selbst, ohne eigenen Filter.
export async function getGlobalLeaderboards(): Promise<{
  meisteFahrten: LeaderboardEntry[];
  meisteHoehenmeter: LeaderboardEntry[];
  meisteKm: LeaderboardEntry[];
  meisteStrecken: LeaderboardEntry[];
}> {
  const supabase = await createClient();

  // Vier unabhängige, jeweils auf TOP_N Zeilen begrenzte Abfragen statt
  // einer einzigen "alles laden"-Abfrage — parallel gestartet.
  const [meisteFahrten, meisteHoehenmeter, meisteKm, meisteStrecken] = await Promise.all([
    topByMetric(supabase, "fahrten_count"),
    topByMetric(supabase, "hoehenmeter"),
    topByMetric(supabase, "km"),
    topByMetric(supabase, "strecken_count"),
  ]);

  return { meisteFahrten, meisteHoehenmeter, meisteKm, meisteStrecken };
}

export interface RouteTimeEntry {
  completionId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  dauerSekunden: number;
  isPremiumBadge: boolean;
}

export interface RouteLeaderboardRow {
  completion_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  dauer_sekunden: number;
  ist_premium: boolean;
  zeigt_premium_badge: boolean;
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
export async function getRouteLeaderboard(routeId: string): Promise<RouteTimeEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_leaderboard")
    .select("completion_id, user_id, display_name, avatar_url, dauer_sekunden, ist_premium, zeigt_premium_badge")
    .eq("route_id", routeId)
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
    // Wie in toEntry(): laufendes Abo UND eigenes Opt-in.
    isPremiumBadge: r.ist_premium === true && r.zeigt_premium_badge === true,
  }));
}
