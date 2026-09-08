import { NextResponse } from "next/server";
import { listRoutesForApi } from "@/lib/routes";
import { averageTempolimit, estimateRouteDurationMinutes } from "@/lib/geo";
import { OEFFENTLICHE_API_HEADER } from "@/lib/apiCors";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";

// Öffentliche API für Strecken inkl. Tempolimit-Daten, damit externe Clients
// (oder eine künftige Mobile-App) optimale Strecken vorschlagen können, ohne
// direkt auf die Datenbank zuzugreifen. Komplett unauthentifiziert — daher
// IP-basiertes Rate Limiting statt des nutzergebundenen isRateLimited.
//
// ?hoehenprofil=1 hängt jeder Strecke ihr Höhenprofil an. Standardmässig
// bleibt es weg, weil es die Antwort um ein Vielfaches aufbläht (siehe
// listRoutesForApi()). Die Info-Seite auf strado.ch zeichnet damit ihre
// Vorzeigestrecke, ohne die Streckendetails einzeln nachladen zu müssen.
export async function GET(request: Request) {
  if (isRateLimitedByKey(`api:strecken:liste:${getClientIp(request.headers)}`, 60, 60_000)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen." },
      { status: 429, headers: OEFFENTLICHE_API_HEADER },
    );
  }

  const mitHoehenprofil =
    new URL(request.url).searchParams.get("hoehenprofil") === "1";
  const routes = await listRoutesForApi(mitHoehenprofil);

  const data = routes.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    start_ort: r.start_ort,
    ziel_ort: r.ziel_ort,
    ist_rundfahrt: r.ist_rundfahrt,
    laenge_km: r.laenge_km,
    hoehe_m: r.hoehe_m,
    max_steigung_prozent: r.max_steigung_prozent,
    kehren: r.kehren,
    kategorien: r.kategorien,
    saison_status: r.saison_status,
    avg_tempolimit_kmh: averageTempolimit(r.tempolimits),
    tempolimit_quelle: r.tempolimits?.length ? "Kartendaten (OSM/Mapbox), nicht amtlich" : null,
    geschaetzte_fahrzeit_min: estimateRouteDurationMinutes(
      r.laenge_km,
      r.kategorien,
      r.tempolimits,
    ),
    ...(mitHoehenprofil ? { hoehenprofil: r.hoehenprofil ?? null } : {}),
  }));

  return NextResponse.json({ routes: data }, { headers: OEFFENTLICHE_API_HEADER });
}
