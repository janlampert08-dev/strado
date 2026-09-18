import { haversineKm } from "@/lib/geo";
import type { TempolimitSegment } from "@/types/database";

// Schweizer Standard-Tempolimits: Zone 30, Ortsdurchfahrt 50, Kantonsstrasse
// 60, ausserorts 80, Autobahn/-strasse 120.
const SPEED_BUCKETS = [
  { max: 30, kmh: 30, color: "#6B7280", label: "30 km/h" },
  { max: 50, kmh: 50, color: "#3D5AFE", label: "50 km/h" },
  { max: 60, kmh: 60, color: "#0EA5A5", label: "60 km/h" },
  { max: 80, kmh: 80, color: "#F59E0B", label: "80 km/h" },
  { max: Infinity, kmh: 120, color: "#DC2626", label: "≥ 100 km/h" },
];

function bucketFor(kmh: number) {
  return SPEED_BUCKETS.find((b) => kmh <= b.max) ?? SPEED_BUCKETS[SPEED_BUCKETS.length - 1];
}

export function speedColor(kmh: number): string {
  return bucketFor(kmh).color;
}

export const SPEED_LEGEND = SPEED_BUCKETS.map((b) => ({ label: b.label, color: b.color }));

// Anteil der Streckenlänge, der mit dem amtlichen "Signalisierte
// Geschwindigkeit"-Datensatz des Kantons Zürich abgeglichen werden konnte
// (0, wenn die Strecke ausserhalb liegt oder keine Segmente markiert sind).
export function amtlicherAnteilProzent(segments: TempolimitSegment[] | null | undefined): number {
  if (!segments || segments.length === 0) return 0;
  const total = segments.reduce((sum, s) => sum + (s.km_bis - s.km_von), 0);
  if (total <= 0) return 0;
  const amtlich = segments
    .filter((s) => s.amtlich)
    .reduce((sum, s) => sum + (s.km_bis - s.km_von), 0);
  return Math.round((amtlich / total) * 100);
}

// Schneidet die Streckengeometrie anhand der km_von/km_bis-Stationierung der
// Tempolimit-Segmente in einzelne Teilstücke, damit jedes farbig nach Limit
// eingefärbt werden kann. Die Stationierung stammt aus derselben Punktfolge,
// daher fallen die kumulierten Distanzen praktisch exakt mit den Original-
// Koordinaten zusammen — keine Interpolation nötig.
export function sliceRouteBySpeed(
  coords: [number, number][],
  segments: TempolimitSegment[],
): { coords: [number, number][]; kmh: number; bekannt: boolean }[] {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }

  return segments
    .map((seg) => {
      const sliceCoords = coords.filter(
        (_, i) => cum[i] >= seg.km_von - 1e-6 && cum[i] <= seg.km_bis + 1e-6,
      );
      return { coords: sliceCoords, kmh: seg.kmh, bekannt: seg.bekannt };
    })
    .filter((s) => s.coords.length >= 2);
}

// Herkunftsangabe für die öffentliche API (/api/strecken): sagt ehrlich, ob
// die Zahlen amtlich, geschätzt oder gemischt sind.
export function tempolimitQuelle(segments: TempolimitSegment[] | null | undefined): string | null {
  if (!segments?.length) return null;
  const anteil = amtlicherAnteilProzent(segments);
  if (anteil === 0) return "Kartendaten (OSM/Mapbox), nicht amtlich";
  if (anteil === 100) return "Amtliche Daten (Kanton/Stadt)";
  return `Amtliche Daten (Kanton/Stadt) für ${anteil} %, sonst Kartendaten (OSM/Mapbox)`;
}
