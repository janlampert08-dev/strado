import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Die Staging-Umgebung läuft unter dieser eigenen Domain (separates
// Vercel-Deployment des staging-Branches) — Produktion läuft unter
// app.strado.ch und ist von diesem Gate nie betroffen.
const STAGING_HOSTNAME = "staging.strado.ch";

// Pfade, die auch auf Staging ohne Login/Moderator-Status erreichbar bleiben
// müssen: die Anmeldeseite selbst (sonst könnte sich niemand einloggen), die
// Auth-Route-Handler (PKCE-Callback für Bestätigungs-/Passwort-Reset-Links,
// Abmeldung — beide laufen, bevor ein Moderator-Status feststeht) sowie
// /api/**, das laut Absprache von diesem Gate ausgenommen bleibt (u.a. der
// Stripe-Webhook, der keine Login-Session mitbringt, und die bewusst
// unauthentifizierten /api/strecken/**-Endpunkte).
function istVomGateAusgenommen(pathname: string): boolean {
  return (
    pathname === "/anmelden" ||
    pathname.startsWith("/anmelden/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/")
  );
}

export async function proxy(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);

  if (
    request.nextUrl.hostname !== STAGING_HOSTNAME ||
    istVomGateAusgenommen(request.nextUrl.pathname)
  ) {
    return response;
  }

  // Kein eingeloggter User (oder kein Supabase-Client, z.B. fehlende
  // .env.local) — zur Anmeldung, mit next zurück auf die ursprüngliche
  // Seite. pathname+search stammen aus der Request-URL selbst statt aus
  // einem Query-Parameter, sind also kein Open-Redirect-Kandidat.
  if (!supabase || !user) {
    const anmeldenUrl = new URL("/anmelden", request.url);
    anmeldenUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(anmeldenUrl);
  }

  // Gleiche Abfrage wie isModerator() in lib/moderation.ts — dort nicht
  // wiederverwendbar, weil das dortige createClient() next/headers nutzt,
  // was in der Middleware nicht zur Verfügung steht.
  const { data: profil } = await supabase
    .from("profiles")
    .select("is_moderator")
    .eq("id", user.id)
    .maybeSingle();

  if (!profil?.is_moderator) {
    return new NextResponse(
      "Diese Staging-Umgebung ist auf Moderatoren beschränkt.",
      { status: 403 },
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
