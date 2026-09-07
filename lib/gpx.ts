import type { RouteGeoJSON } from "@/types/database";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Baut ein GPX-1.1-Dokument aus der Streckengeometrie, damit die Route in
// Navigationsgeräte (Garmin, TomTom Rider) oder Apps wie Calimoto/Kurviger
// importiert werden kann. Bei Rundfahrten gibt es nur einen Start-Wegpunkt
// (Ziel = Start), sonst je einen für Start und Ziel.
export function buildGpx(route: RouteGeoJSON): string {
  const name = escapeXml(route.name);

  const wpts = [
    `  <wpt lat="${route.start_geojson.coordinates[1]}" lon="${route.start_geojson.coordinates[0]}"><name>Start</name></wpt>`,
    ...(route.ist_rundfahrt
      ? []
      : [
          `  <wpt lat="${route.ziel_geojson.coordinates[1]}" lon="${route.ziel_geojson.coordinates[0]}"><name>Ziel</name></wpt>`,
        ]),
  ].join("\n");

  const trkpts = route.geometry_geojson.coordinates
    .map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}" />`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strado" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
  </metadata>
${wpts}
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

export function gpxFileName(routeName: string): string {
  const transliterated = routeName
    .toLowerCase()
    .split("")
    .map((ch) => UMLAUT_MAP[ch] ?? ch)
    .join("");
  const slug = transliterated.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "strecke"}.gpx`;
}
