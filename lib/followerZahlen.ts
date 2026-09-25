import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { istFunktionUnbekannt } from "@/lib/moderatorStatus";

// Follower-Zahlen für mehrere Konten — für die Profilsuche
// (searchProfiles in lib/actions/profile.ts), die zu jedem Treffer die Zahl
// zeigt.
//
// Ein Aufruf von get_follow_counts_many (0155) statt einem
// get_follow_counts je Treffer: vorher bis zu acht parallele RPCs pro
// Suche. Gleiche Semantik, gleiche Rechte — siehe den Kopf der Migration.
//
// Rückweg: solange 0155 nicht eingespielt ist, gibt es die Funktion nicht
// (PGRST202 aus dem Schema-Cache bzw. 42883), und dann wird wie bisher je
// Konto einzeln gefragt. Staging und main laufen auf derselben Datenbank;
// der Code darf also vor der Migration ausgeliefert werden.
//
// Jeder andere Fehler ergibt Zahl 0 für alle — wie vorher, als ein
// fehlgeschlagener Einzelaufruf data = null und damit 0 ergab. Die Zahl ist
// Beiwerk zur Namenssuche, kein Grund, die ganze Suche scheitern zu lassen.

/** Follower-Zahl je Konto-ID; fehlende IDs heissen 0. */
export async function ladeFollowerZahlen(
  supabase: SupabaseClient<Database>,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.rpc("get_follow_counts_many", { user_ids: [...ids] });
  if (!error) {
    return new Map(
      ((data ?? []) as { user_id: string; followers: number | null }[]).map((zeile) => [
        zeile.user_id,
        zeile.followers ?? 0,
      ]),
    );
  }
  if (!istFunktionUnbekannt(error)) return new Map();

  const einzeln = await Promise.all(
    ids.map(async (id) => {
      const { data: zeile } = await supabase
        .rpc("get_follow_counts", { p_user_id: id })
        .single();
      return [id, (zeile as { followers?: number } | null)?.followers ?? 0] as const;
    }),
  );
  return new Map(einzeln);
}
