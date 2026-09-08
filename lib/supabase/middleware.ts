import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

// Gibt neben der Response auch den anfragegebundenen Client und den (falls
// vorhanden) eingeloggten User zurück — proxy.ts braucht beides für das
// Staging-Zugriffsgate (Moderator-Check per Folgeabfrage auf profiles), ohne
// getUser() ein zweites Mal aufzurufen oder einen eigenen, cookie-gebundenen
// Client zu bauen.
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

  // Wichtig: getUser() aktualisiert den Session-Token bei Bedarf.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, supabase, user };
}
