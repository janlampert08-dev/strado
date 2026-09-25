import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

// Gibt neben der Response auch den anfragegebundenen Client und den (falls
// vorhanden) eingeloggten User zurück — proxy.ts braucht beides für das
// Staging-Zugriffsgate (Moderator-Check per Folgeabfrage auf profiles), ohne
// die Sitzung ein zweites Mal zu prüfen oder einen eigenen, cookie-gebundenen
// Client zu bauen. Vom User gibt es nur die id: mehr braucht der Proxy nicht,
// und mehr steht ohne GoTrue-Abfrage nicht verlässlich zur Verfügung.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    // Noch kein Supabase-Projekt verknüpft (.env.local fehlt) — Session-Refresh überspringen,
    // damit die App auch ohne Backend-Anbindung lauffähig bleibt.
    return { response: supabaseResponse, supabase: null, user: null };
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() statt getUser(): prüft die Signatur des Access-Tokens lokal
  // gegen den JWKS-Schlüssel des Projekts (ES256, im Modul zwischengespeichert,
  // 10 Minuten) statt bei jeder Anfrage GoTrue (/auth/v1/user) zu fragen.
  //
  // Der Refresh bleibt erhalten: getClaims() holt das Token über getSession(),
  // und das tauscht ein (fast) abgelaufenes Token gegen den Refresh-Token —
  // derselbe Weg, den getUser() vorher nahm. @supabase/ssr schreibt das neue
  // Token dann über setAll() in die Response-Cookies. Schlägt der Refresh fehl
  // (Refresh-Token widerrufen), gibt es keine Claims, also keinen User.
  //
  // Preis: ein Token, dessen Sitzung serverseitig beendet wurde (Abmeldung auf
  // einem anderen Gerät, Konto gelöscht), gilt hier bis zu seinem Ablauf
  // (JWT-Lebensdauer, Standard 1 h) weiter. RLS/PostgREST prüfen ohnehin nur
  // das JWT, nicht die Sitzung; die schreibenden Server Actions fragen
  // weiterhin selbst per getUser() bei GoTrue nach. Mit einem symmetrischen
  // (HS256-)Token fällt die Bibliothek von selbst auf getUser() zurück.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims.sub;
  const user = typeof sub === "string" && sub.length > 0 ? { id: sub } : null;

  return { response: supabaseResponse, supabase, user };
}
