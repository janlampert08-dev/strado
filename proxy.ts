import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { istStaging } from "@/lib/staging";
import { leseUuidStreckenseite, slugWeiterleitungsZiel } from "@/lib/streckenPfad";

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

// Alte Streckenadressen /strecken/<uuid>(/bearbeiten) dauerhaft (308) auf
// den Slug umleiten (0130, lib/streckenPfad.ts).
//
// Hier und nicht in der Seite: app/strecken/[id]/ hat eine loading.tsx, die
// Seite streamt also. Ein permanentRedirect() aus der Seite fiele erst, wenn
// die Hülle schon mit 200 unterwegs ist, und käme dann als Meta-Refresh im
// Browser an — für eine Suchmaschine und für die Vorschau eines geteilten
// Links ist das keine dauerhafte Weiterleitung.
//
// Die Abfrage läuft über den Client der Anfrage (Sitzung der Person, RLS),
// also dieselbe Sicht wie die Seite: eine Strecke, die man nicht sehen darf,
// liefert keinen Slug, und die Anfrage geht unverändert weiter zur Seite,
// die dann ihre 404 zeigt. Jeder Fehler — auch die fehlende Spalte vor
// 0130 — heisst ebenso "keine Weiterleitung": die UUID-Adresse funktioniert
// immer, die Weiterleitung ist nur der schönere Weg.
//
// Kostet eine kleine Abfrage (Primärschlüssel) nur für Aufrufe unter der
// UUID; die App selbst verlinkt, wo sie den Slug kennt, direkt dorthin.
async function streckenSlugWeiterleitung(
  request: NextRequest,
  supabase: Awaited<ReturnType<typeof updateSession>>["supabase"],
  response: NextResponse,
): Promise<NextResponse | null> {
  if (!supabase || (request.method !== "GET" && request.method !== "HEAD")) return null;
  const seite = leseUuidStreckenseite(request.nextUrl.pathname);
  if (!seite) return null;

  const { data, error } = await supabase
    .from("routes")
    .select("slug")
    .eq("id", seite.id)
    .maybeSingle();
  if (error || !data) return null;

  const ziel = slugWeiterleitungsZiel(
    seite.unterpfad,
    request.nextUrl.search,
    (data as { slug?: string | null }).slug,
  );
  if (!ziel) return null;

  const weiterleitung = NextResponse.redirect(new URL(ziel, request.url), 308);
  // Die erneuerten Sitzungs-Cookies aus updateSession() mitgeben — sonst
  // ginge ein gerade rotierter Token mit der Weiterleitung verloren.
  for (const cookie of response.cookies.getAll()) weiterleitung.cookies.set(cookie);
  return weiterleitung;
}

export async function proxy(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);

  if (
    !istStaging(request.nextUrl.hostname) ||
    istVomGateAusgenommen(request.nextUrl.pathname)
  ) {
    return (await streckenSlugWeiterleitung(request, supabase, response)) ?? response;
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

  return (await streckenSlugWeiterleitung(request, supabase, response)) ?? response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
