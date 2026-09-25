import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Moderator-Status des eingeloggten Kontos — gemeinsam für isModerator()
// (lib/moderation.ts) und das Staging-Gate in proxy.ts, die unterschiedliche
// Clients haben (next/headers gibt es in der Middleware nicht).
//
// Seit 0134_rechte_nachziehen.sql ist profiles.is_moderator weder für anon
// noch für authenticated lesbar: vorher liessen sich alle Moderatorenkonten
// mit dem öffentlichen Schlüssel auflisten. Das eigene Flag liefert
// stattdessen die SECURITY-DEFINER-Funktion ist_moderator(), und zwar immer
// das des AUFRUFENDEN Kontos (auth.uid()) — nie das eines anderen.
//
// `userId` braucht nur noch der Rückweg: solange 0134 nicht eingespielt ist,
// gibt es die Funktion nicht, und dann wird wie bisher die Spalte gelesen.
// Alle Aufrufer übergeben ohnehin die ID aus getUser(), also dasselbe Konto.
//
// Jeder andere Fehler zählt als "kein Moderator" — wie vorher, als ein
// Lesefehler data = null und damit false ergab. Geschlossen statt offen: ein
// fälschlich verweigerter Moderator lädt neu, ein fälschlich eingelassener
// Nicht-Moderator sähe Meldungen und staging.

/** Fehlt die Funktion (0134 noch nicht eingespielt)? Nur dann den alten Weg gehen. */
export function istFunktionUnbekannt(fehler: { code?: string | null } | null | undefined): boolean {
  // PGRST202: nicht im Schema-Cache von PostgREST. 42883: undefined_function.
  return fehler?.code === "PGRST202" || fehler?.code === "42883";
}

export async function leseModeratorStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("ist_moderator");
  if (!error) return data === true;
  if (!istFunktionUnbekannt(error)) return false;

  const { data: profil } = await supabase
    .from("profiles")
    .select("is_moderator")
    .eq("id", userId)
    .maybeSingle();
  return profil?.is_moderator === true;
}
