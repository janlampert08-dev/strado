import { createClient } from "@/lib/supabase/server";
import { throwOnQueryError } from "@/lib/queryError";
import type { PassStatus } from "@/lib/passStatus";

// Die Abfrageseite von Passstatus und Pass-Alarm (0112) — getrennt von
// lib/passStatus.ts, das auch in Client Components landet.
//
// Alles hier läuft über den an die Session gebundenen Client, also unter
// RLS. Welche Zeilen sichtbar sind, entscheidet die Datenbank: der Status
// nur für freigegebene, nicht private Strecken, Alarme nur die eigenen.

const STATUS_SPALTEN = "route_id, status, voraussichtlich_offen_ab, hinweis, quelle, geprueft_am";

/** Der aktuelle Status einer Strecke, oder null, wenn keiner erfasst ist. */
export async function getPassStatus(routeId: string): Promise<PassStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pass_status")
    .select(STATUS_SPALTEN)
    .eq("route_id", routeId)
    .maybeSingle();
  // Ein Ausfall darf nicht als "kein Status erfasst" durchgehen — auf der
  // Streckenseite hiesse das, eine Wintersperre verschwiegen zu haben.
  throwOnQueryError(error, "Passstatus");
  return (data as PassStatus | null) ?? null;
}

/** Hat das angemeldete Konto einen Alarm auf dieser Strecke? */
export async function hatPassAlarm(routeId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pass_alarme")
    .select("route_id")
    .eq("route_id", routeId)
    .eq("user_id", userId)
    .maybeSingle();
  throwOnQueryError(error, "Pass-Alarm");
  return data !== null;
}

export interface PassStreckeMitStatus {
  id: string;
  name: string;
  region: string;
  status: PassStatus | null;
}

// Für die Moderation: jede freigegebene, öffentliche Passstrecke mit ihrem
// Status — auch die ohne, denn genau die sind zu erfassen. Veraltete und
// fehlende zuerst, damit oben steht, was eine Prüfung braucht.
export async function getPassStreckenMitStatus(): Promise<PassStreckeMitStatus[]> {
  const supabase = await createClient();
  const { data: strecken, error } = await supabase
    .from("routes")
    .select("id, name, region")
    .eq("status_ok", true)
    .eq("ist_privat", false)
    .contains("kategorien", ["passstrasse"])
    .order("name", { ascending: true });
  throwOnQueryError(error, "Passstrecken");
  if (!strecken || strecken.length === 0) return [];

  const { data: stati, error: statusFehler } = await supabase
    .from("pass_status")
    .select(STATUS_SPALTEN)
    .in(
      "route_id",
      strecken.map((s) => s.id),
    );
  throwOnQueryError(statusFehler, "Passstatus");

  const statusNachStrecke = new Map(
    ((stati as PassStatus[] | null) ?? []).map((s) => [s.route_id, s]),
  );

  return strecken
    .map((s) => ({
      id: s.id as string,
      name: s.name as string,
      region: s.region as string,
      status: statusNachStrecke.get(s.id as string) ?? null,
    }))
    .sort((a, b) => {
      // Ohne Status zuerst, dann die am längsten nicht geprüften. Der
      // Name bleibt bei Gleichstand die Ordnung aus der Abfrage (stabil).
      const alterA = a.status ? Date.parse(a.status.geprueft_am) : -Infinity;
      const alterB = b.status ? Date.parse(b.status.geprueft_am) : -Infinity;
      return alterA === alterB ? 0 : alterA < alterB ? -1 : 1;
    });
}

export interface ReceivedPassMeldung {
  meldungId: number;
  routeId: string;
  routeName: string;
  erstelltAm: string;
  neu: boolean;
}

// Die letzten Öffnungsmeldungen (recent_pass_meldungen, 0112) — die dritte
// Quelle der Aktivität neben Kudos und Followern.
export async function getRecentPassMeldungen(): Promise<ReceivedPassMeldung[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recent_pass_meldungen");
  // Wie bei Kudos und Followern: ein Fehler ist nicht "keine Meldungen".
  throwOnQueryError(error, "Pass-Meldungen");
  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    // bigint kommt über PostgREST als JSON-Zahl.
    meldungId: Number(row.meldung_id),
    routeId: row.route_id as string,
    routeName: row.route_name as string,
    erstelltAm: row.erstellt_am as string,
    neu: row.neu as boolean,
  }));
}
