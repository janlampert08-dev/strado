import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { istStaging } from "@/lib/staging";
import { leseModeratorStatus } from "@/lib/moderatorStatus";

// Pfade, die auch auf Staging ohne Login/Moderator-Status erreichbar bleiben
// müssen: die Anmeldeseite selbst (sonst könnte sich niemand einloggen), die
// Auth-Route-Handler (PKCE-Callback für Bestätigungs-/Passwort-Reset-Links,
// Abmeldung — beide laufen, bevor ein Moderator-Status feststeht) sowie
// /robots.txt (sonst bekäme ein Crawler statt "disallow: /" eine Weiterleitung).
//
// /api/** ist bewusst KEIN pauschales Exempt mehr: Staging spricht gegen die
// Produktions-DB, und jede künftige /api-Route stünde sonst automatisch mit
// Prod-Daten öffentlich. Allowlist statt Prefix: Webhook (keine Session),
// die bewusst öffentlichen Strecken-Endpunkte, die Cron-Routen (eigenes
// CRON_SECRET) und der Client-Fehler-Logger.
function istVomGateAusgenommen(pathname: string): boolean {
  if (
    pathname === "/anmelden" ||
    pathname.startsWith("/anmelden/") ||
    pathname.startsWith("/auth/") ||
    pathname === "/robots.txt"
  ) {
    return true;
  }
  return (
    pathname === "/api/stripe/webhook" ||
    pathname === "/api/strecken" ||
    pathname.startsWith("/api/strecken/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/fehler"
  );
}

export async function proxy(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);

  if (
    !istStaging(request.nextUrl.hostname) ||
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
  // was in der Middleware nicht zur Verfügung steht. Beide gehen über
  // leseModeratorStatus(): seit 0134 ist profiles.is_moderator nicht mehr
  // direkt lesbar, das eigene Flag kommt aus ist_moderator().
  if (!(await leseModeratorStatus(supabase, user.id))) {
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
