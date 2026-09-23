import { NextResponse } from "next/server";
import { getRoute } from "@/lib/routes";
import { CACHE_PRIVAT, geometrieCacheControl, kodiereGeometrie } from "@/lib/streckenGeometrie";
import { isValidUuid } from "@/lib/validation";

// Die volle Linie einer Strecke als Encoded Polyline — für die Streckenseite,
// die in ihrer Nutzlast nur noch die Übersichtslinie mitschickt (siehe
// lib/streckenGeometrie.ts).
//
// BEWUSST NICHT UNTER app/api/strecken/. Das dortige öffentliche API ist
// geschützter Bereich (anonym, IP-begrenzt, CORS *). Dieser Endpunkt ist das
// Gegenteil davon: gleiche Herkunft, ohne CORS-Header, und er liest mit der
// Sitzung der anfragenden Person. Er sieht damit genau das, was die
// Streckenseite sieht — getRoute() über den normalen Server-Client, RLS
// entscheidet. Eine private Strecke bekommt nur, wer sie auch als Seite
// öffnen darf; alle anderen bekommen dieselbe 404 wie für eine unbekannte ID.
// Kein Admin-Client. Auf staging gilt das Moderatoren-Tor aus proxy.ts wie
// für die Seite, weil der Pfad nicht unter /api/ liegt.
//
// Caching (Entscheid in geometrieCacheControl, getestet):
//   - Freigegeben und öffentlich, mit passender ?v=: ein Jahr, immutable.
//     Die Version hängt an der Linie selbst — ändert sich die Geometrie,
//     ändert sich die Adresse, die die Seite ausliefert. Vercels CDN
//     speichert trotzdem nichts, weil es dafür s-maxage oder
//     CDN-Cache-Control bräuchte. Das ist gewollt: so gilt das Tor auf
//     staging bei jeder Anfrage, und eine Strecke, die später privat wird,
//     liegt nicht ein Jahr lang auf einem Edge-Knoten.
//   - Privat, noch nicht freigegeben, oder ohne/mit veralteter Version:
//     private, no-store. Die Antwort hängt dann an der Sitzung (RLS) bzw.
//     ist nicht die zur Adresse gehörende Linie. Das kostet die Besitzerin
//     einer privaten Strecke ein paar KB pro Aufruf.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: "Strecke nicht gefunden" },
      { status: 404, headers: { "Cache-Control": CACHE_PRIVAT } },
    );
  }

  let route;
  try {
    route = await getRoute(id);
  } catch {
    return NextResponse.json(
      { error: "Strecke konnte nicht geladen werden" },
      { status: 500, headers: { "Cache-Control": CACHE_PRIVAT } },
    );
  }

  if (!route || !Array.isArray(route.geometry_geojson?.coordinates)) {
    return NextResponse.json(
      { error: "Strecke nicht gefunden" },
      { status: 404, headers: { "Cache-Control": CACHE_PRIVAT } },
    );
  }

  const { v, p } = kodiereGeometrie(route.geometry_geojson);
  const cacheControl = geometrieCacheControl({
    status_ok: route.status_ok,
    ist_privat: route.ist_privat,
    angefragteVersion: new URL(request.url).searchParams.get("v"),
    version: v,
  });

  return NextResponse.json({ v, p }, { headers: { "Cache-Control": cacheControl } });
}
