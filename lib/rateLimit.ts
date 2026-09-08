import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Einfacher Cooldown ohne externe Infrastruktur (kein Redis nötig): blockt
// wiederholte Einträge desselben Nutzers innerhalb eines kurzen Zeitfensters,
// um Spam/Skript-Missbrauch zu bremsen. Echte Nutzung (mehrere Fahrten an
// unterschiedlichen Tagen, gelegentliche Neubewertungen) bleibt unberührt,
// da das Fenster nur wenige Sekunden umfasst.
export async function isRateLimited(
  supabase: SupabaseClient,
  table: string,
  timestampColumn: string,
  userColumn: string,
  userId: string,
  cooldownMs: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select(timestampColumn)
    .eq(userColumn, userId)
    .order(timestampColumn, { ascending: false })
    .limit(1)
    .maybeSingle();

  // Der Fehler wurde bisher verworfen, und ein Lesefehler liefert data=null
  // — dasselbe wie "noch nie geschrieben". Die Bremse fiel damit bei jedem
  // Datenbankproblem lautlos aus, also genau dann, wenn die Datenbank ohnehin
  // schon unter Last steht.
  //
  // Deshalb geschlossen statt offen: die Kosten sind nicht symmetrisch. Wer
  // im Fehlerfall blockiert wird, sieht einen Hinweis und versucht es gleich
  // noch einmal; im offenen Fall gibt es keine Bremse mehr und keine Meldung
  // darüber. Das Fenster umfasst wenige Sekunden, echte Nutzung verliert also
  // höchstens einen Anlauf.
  if (error) {
    console.error("Cooldown-Prüfung fehlgeschlagen — vorsorglich gebremst", {
      table,
      userColumn,
      error,
    });
    return true;
  }

  if (!data) return false;
  const lastTimestamp = (data as unknown as Record<string, string>)[timestampColumn];
  if (!lastTimestamp) return false;
  return Date.now() - new Date(lastTimestamp).getTime() < cooldownMs;
}

// In-Memory-Limiter für Fälle ohne eigene Tabellenzeile mit Zeitstempel, auf
// die isRateLimited oben aufsetzen könnte: unautorisierte Requests (die
// öffentlichen app/api/strecken-Routen) und Auth-Aktionen vor dem Login, wo
// noch keine user_id existiert. Bewusst ohne externe Infrastruktur (Redis
// o.ä.) — pro Serverless-Instanz gehalten. Das ist keine global konsistente
// Bremse über mehrere Instanzen hinweg, reicht aber als erste Hürde gegen
// einfachen Skript-/Brute-Force-Missbrauch.
const hitLog = new Map<string, number[]>();
const MAX_TRACKED_KEYS = 5000;

export function isRateLimitedByKey(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hitLog.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hitLog.set(key, recent);
    return true;
  }

  recent.push(now);
  hitLog.set(key, recent);

  // Verhindert unbegrenztes Wachstum der Map über die Lebensdauer einer
  // warmen Instanz, wenn sehr viele unterschiedliche Keys (z. B. IPs)
  // auftreten.
  if (hitLog.size > MAX_TRACKED_KEYS) {
    for (const [k, timestamps] of hitLog) {
      if (timestamps.every((t) => now - t >= windowMs)) hitLog.delete(k);
    }
  }

  return false;
}

// Ermittelt die Client-IP aus Proxy-Headern (Vercel setzt x-forwarded-for)
// für IP-basiertes Rate Limiting dort, wo keine Session/user_id existiert.
export function getClientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
