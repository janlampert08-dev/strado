import { haversineKm } from "@/lib/geo";
import type { RouteGeoJSON } from "@/types/database";

/**
 * Google deckelt die Zwischenziele je nach Plattform, auf der der Link
 * geöffnet wird: "The number of waypoints allowed varies by the platform
 * where the link opens, with up to three waypoints supported on mobile
 * browsers, and a maximum of nine waypoints supported otherwise."
 * (developers.google.com/maps/documentation/urls/get-started)
 *
 * Welche der beiden Grenzen gilt, kann der Link beim Bauen nicht wissen —
 * ein Tipp auf dem Handy landet mal in der Maps-App und mal im mobilen
 * Browser oder im In-App-Browser von Instagram/WhatsApp. Deshalb gilt hier
 * die KLEINERE Grenze. Vorher standen acht Zwischenziele in der URL, und das
 * war der unzuverlässige Teil: am Schreibtisch ging der Link, auf dem Handy
 * kam die Strecke ohne Zwischenziele an — also als Luftlinie Start→Ziel über
 * die Autobahn statt über die Passstrasse — oder gar nicht.
 *
 * Drei Zwischenziele führen die Strecke gröber nach als acht. Das ist der
 * bewusste Tausch: ein Link, der überall funktioniert, ist mehr wert als
 * einer, der auf dem Gerät, auf dem er gebraucht wird, still kaputtgeht.
 */
const MAX_WAYPOINTS = 3;

/**
 * Fünf Nachkommastellen sind rund einen Meter genau — feiner muss ein
 * Zwischenziel nicht sein, das Google ohnehin auf die nächste Strasse rastet.
 * PostGIS liefert volle double-Genauigkeit (bis zu 17 Stellen pro Zahl); das
 * bläht die URL ohne Gegenwert auf, und Maps-URLs sind laut derselben Doku
 * auf 2048 Zeichen begrenzt.
 */
const KOORDINATEN_STELLEN = 5;

function toLatLng([lon, lat]: [number, number]): string {
  return `${lat.toFixed(KOORDINATEN_STELLEN)},${lon.toFixed(KOORDINATEN_STELLEN)}`;
}

/**
 * Verteilt die Zwischenziele nach zurückgelegter DISTANZ, nicht nach Index im
 * Koordinatenarray.
 *
 * Die Geometrie kommt aus dem Routing und setzt ihre Stützpunkte dort dicht,
 * wo die Strasse sich krümmt: in den Kehren liegen sie wenige Meter
 * auseinander, auf der Geraden kilometerweit. Eine Auswahl über den Index
 * häuft die Zwischenziele deshalb in den Serpentinen an und lässt die langen
 * Geraden ohne — und genau dort entscheidet sich, ob Google die Passstrasse
 * oder die parallele Hauptstrasse nimmt.
 */
function waypointsNachDistanz(
  coords: [number, number][],
  anzahl: number,
): [number, number][] {
  if (anzahl < 1 || coords.length < 3) return [];

  const kumuliert: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    kumuliert.push(kumuliert[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }
  const gesamt = kumuliert[kumuliert.length - 1];
  if (!(gesamt > 0)) return [];

  const gewaehlt: [number, number][] = [];
  const belegt = new Set<number>();
  for (let n = 1; n <= anzahl; n++) {
    const zielDistanz = (gesamt * n) / (anzahl + 1);
    let index = kumuliert.findIndex((d) => d >= zielDistanz);
    if (index === -1) index = coords.length - 1;
    // Start und Ziel stehen schon als origin/destination in der URL — ein
    // Zwischenziel auf demselben Punkt ist für Google ein Nullsegment.
    index = Math.min(Math.max(index, 1), coords.length - 2);
    if (belegt.has(index)) continue;
    belegt.add(index);
    gewaehlt.push(coords[index]);
  }
  return gewaehlt;
}

// Baut eine Google-Maps-Directions-URL mit ein paar Zwischenpunkten aus der
// echten Streckengeometrie, damit die Route grob dem tatsächlichen
// Strassenverlauf folgt statt einer Luftlinie Start→Ziel.
export function buildGoogleMapsUrl(route: RouteGeoJSON): string {
  const coords = route.geometry_geojson?.coordinates ?? [];
  const start = route.start_geojson.coordinates;
  const end = route.ziel_geojson.coordinates;

  const params = new URLSearchParams({
    api: "1",
    origin: toLatLng(start),
    destination: toLatLng(end),
    travelmode: "driving",
  });

  const waypoints = waypointsNachDistanz(coords, MAX_WAYPOINTS);
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(toLatLng).join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
