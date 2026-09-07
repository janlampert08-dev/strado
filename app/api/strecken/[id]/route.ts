import { NextResponse } from "next/server";
import { getRoute } from "@/lib/routes";
import { averageTempolimit, estimateRouteDurationMinutes } from "@/lib/geo";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isRateLimitedByKey(`api:strecken:detail:${getClientIp(request.headers)}`, 60, 60_000)) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Strecke nicht gefunden" }, { status: 404 });
  }

  const route = await getRoute(id);

  if (!route) {
    return NextResponse.json({ error: "Strecke nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({
    id: route.id,
    name: route.name,
    region: route.region,
    start_ort: route.start_ort,
    ziel_ort: route.ziel_ort,
    ist_rundfahrt: route.ist_rundfahrt,
    laenge_km: route.laenge_km,
    hoehe_m: route.hoehe_m,
    max_steigung_prozent: route.max_steigung_prozent,
    kehren: route.kehren,
    kategorien: route.kategorien,
    saison_status: route.saison_status,
    charakter_text: route.charakter_text,
    geometry: route.geometry_geojson,
    tempolimits: route.tempolimits,
    tempolimit_quelle: route.tempolimits?.length ? "Kartendaten (OSM/Mapbox), nicht amtlich" : null,
    avg_tempolimit_kmh: averageTempolimit(route.tempolimits),
    geschaetzte_fahrzeit_min: estimateRouteDurationMinutes(
      route.laenge_km,
      route.kategorien,
      route.tempolimits,
    ),
  });
}
