import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { throwOnQueryError } from "@/lib/queryError";

export interface KudosInfo {
  count: number;
  givenByMe: boolean;
}

// Ein Batch-Read für eine ganze Liste von Fahrten statt einer Query pro
// Kudos-Button. kudos_summary (0029) ist bereits auf öffentliche Fahrten gefiltert, die
// zweite Query (eigene Kudos) braucht deshalb keinen zusätzlichen
// ist_oeffentlich-Check.
export async function getKudosForCompletions(
  completionIds: string[],
  userId: string | null,
): Promise<Map<string, KudosInfo>> {
  const result = new Map<string, KudosInfo>();
  if (completionIds.length === 0) return result;

  const supabase = await createClient();

  const [{ data: summary }, { data: own }] = await Promise.all([
    supabase.from("kudos_summary").select("completion_id, kudos_count").in("completion_id", completionIds),
    userId
      ? supabase.from("kudos").select("completion_id").eq("user_id", userId).in("completion_id", completionIds)
      : Promise.resolve({ data: [] as { completion_id: string }[] }),
  ]);

  const ownIds = new Set((own ?? []).map((k) => k.completion_id));

  for (const id of completionIds) {
    result.set(id, { count: 0, givenByMe: ownIds.has(id) });
  }
  for (const row of summary ?? []) {
    result.set(row.completion_id, {
      count: row.kudos_count,
      givenByMe: ownIds.has(row.completion_id),
    });
  }

  return result;
}

// Anzahl Kudos auf den eigenen Fahrten seit dem letzten Besuch des eigenen
// Profils (profiles.kudos_gesehen_am) — der Rückkanal für "Community
// reagiert" im Kernloop (siehe AGENTS.md, "Core User Loop"). Läuft über die
// SECURITY-DEFINER-Funktion count_unseen_kudos (0053_kudos_gesehen.sql),
// die ausschliesslich auf auth.uid() arbeitet: es gibt bewusst keinen
// userId-Parameter, ein Aufruf liefert immer nur die eigenen ungelesenen
// Kudos des eingeloggten Nutzers.
//
// Mit React cache() umschlossen: <Header /> fragt den Zähler auf jeder
// Seite ab, und /profil braucht ihn zusätzlich selbst, um MarkKudosSeen nur
// bei Bedarf feuern zu lassen — ohne cache() wären das zwei RPCs pro
// Request für dieselbe Zahl.
export const getUnseenKudosCount = cache(async function getUnseenKudosCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_unseen_kudos");
  if (error || data == null) return 0;
  return Number(data);
});

export interface ReceivedKudos {
  completionId: string;
  giverId: string;
  giverDisplayName: string | null;
  giverAvatarUrl: string | null;
  erstelltAm: string;
  neu: boolean;
}

// Die letzten Kudos auf den eigenen Fahrten, für /aktivitaet — dieselbe
// Sicherheitslogik wie getUnseenKudosCount, nur als Liste statt als reine
// Zahl. Läuft über die SECURITY-DEFINER-Funktion recent_kudos_received
// (0057_kudos_aktivitaetsliste.sql), ebenfalls ausschliesslich auf
// auth.uid() beschränkt.
export async function getRecentKudosReceived(): Promise<ReceivedKudos[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recent_kudos_received");
  // Ein echter Query-Fehler darf nicht als "keine Kudos" durchgehen — sonst
  // sähe ein Ausfall auf /aktivitaet identisch aus wie eine leere, aber
  // funktionierende Liste. Siehe lib/queryError.ts.
  throwOnQueryError(error, "Kudos-Aktivität");
  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    completionId: row.completion_id as string,
    giverId: row.giver_id as string,
    giverDisplayName: row.giver_display_name as string | null,
    giverAvatarUrl: row.giver_avatar_url as string | null,
    erstelltAm: row.erstellt_am as string,
    neu: row.neu as boolean,
  }));
}
