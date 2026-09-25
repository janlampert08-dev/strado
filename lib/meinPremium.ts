import type { PostgrestError } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Der eigene Abo-Status (profiles.ist_premium) — gelesen über
// mein_premium() (0154).
//
// Bis 0154 hatten anon und authenticated einen Spalten-Grant auf
// ist_premium, und weil die SELECT-Policy auf profiles zeilenoffen ist,
// las jeder den Abo-Status JEDER Person — auch derer, die das Abzeichen
// verbergen. 0154 nimmt den Grant zurück; der eigene Wert kommt nur noch
// über die SECURITY-DEFINER-Funktion, die auf auth.uid() festgelegt ist.
// Fremde Profile zeigen weiterhin nur zeigt_premium_abzeichen (0087).
//
// Solange 0154 nicht eingespielt ist, fehlt die Funktion (PGRST202); dann
// gilt der bisherige Weg über die Spalte, damit dieser Code vor der
// Migration deployt werden kann — dasselbe Muster wie meine_privatzone()
// in lib/publicTrack.ts. Nach der Migration schlüge genau dieser Weg fehl,
// er wird aber nicht mehr erreicht.
//
// Ein Fehler wird zurückgegeben, nicht verschluckt: getPremiumStatus()
// wirft ihn, statt ein zahlendes Konto still als Gratis-Konto zu führen.
export async function eigenerPremiumStatus(
  supabase: ServerClient,
  userId: string,
): Promise<{ aktiv: boolean; fehler: PostgrestError | null }> {
  const { data, error } = await supabase.rpc("mein_premium");
  if (!error) return { aktiv: data === true, fehler: null };
  if (error.code !== "PGRST202") return { aktiv: false, fehler: error };

  // Vor 0154: direkt aus der Spalte (RLS-Client, eigene Zeile).
  const alt = await supabase
    .from("profiles")
    .select("ist_premium")
    .eq("id", userId)
    .maybeSingle<{ ist_premium: boolean }>();
  if (alt.error) return { aktiv: false, fehler: alt.error };
  return { aktiv: alt.data?.ist_premium === true, fehler: null };
}
