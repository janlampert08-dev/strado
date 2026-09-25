import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Server-Client OHNE Sitzung — liest genau das, was die Rolle anon sieht.
//
// Gebraucht für Daten, die über Anfragen hinweg zwischengespeichert werden
// (lib/streckenCache.ts, unstable_cache). server.ts hängt an den Cookies der
// Anfrage und liest als angemeldeter Nutzer — ein Ergebnis daraus in einen
// geteilten Cache zu legen hiesse, die RLS-Sicht einer Person an alle
// auszuliefern (eigene private oder noch nicht freigegebene Strecken).
// Dieser Client kennt keine Person: RLS gibt ihm nur die öffentlichen Zeilen,
// und was er liefert, darf deshalb jede Anfrage sehen.
//
// Nur der Publishable Key, derselbe wie im Browser (client.ts) — kein
// Geheimnis, keine RLS-Umgehung. Keine Sitzung speichern, keine erneuern:
// es gibt keine.
export function createAnonClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
}
