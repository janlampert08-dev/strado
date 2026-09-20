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

// Dieselben Farben für das GEFAHRENE Tempo (lib/tempoprofil.ts). Die
// Beschriftung ist eine andere: dort steht ein Limit, hier ein Bereich —
// "50 km/h" hiesse auf der eigenen Fahrt "genau 50", gemeint ist "31 bis 50".
export const TEMPO_LEGENDE = SPEED_BUCKETS.map((b, i) => ({
  label:
    b.max === Infinity ? `über ${SPEED_BUCKETS[i - 1].max} km/h` : `bis ${b.max} km/h`,
  color: b.color,
}));

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

  // Die beiden absoluten Aussagen hängen an den Flags selbst, nicht am
  // gerundeten Anteil. amtlicherAnteilProzent() rundet: eine 20-km-Strecke
  // mit 100 m aus Kartendaten ergibt 99,5 % → 100, und die Antwort behauptete
  // dann ohne jede Einschränkung eine Behörde als Quelle für die ganze
  // Strecke. Das ist die einzige der drei Formulierungen, die das tut, und
  // sie steht auf der öffentlichen API, die per CORS von jeder Origin lesbar
  // ist. Die Gegenrichtung (0,4 % → 0 → "nicht amtlich") untertreibt und ist
  // harmlos, wird hier aber genauso exakt geprüft.
  if (segments.every((s) => !s.amtlich)) return "Kartendaten (OSM/Mapbox), nicht amtlich";
  if (segments.every((s) => s.amtlich)) return "Amtliche Daten (Kanton/Stadt)";

  // Gemischt. Der Anteil wird hier bei 99 gedeckelt: sonst stünde bei 99,5 %
  // "für 100 %, sonst Kartendaten" — ein Satz, der sich selbst widerspricht.
  // Der Deckel greift nur ganz oben und lässt jeden anderen Wert unberührt;
  // untertreiben ist bei einer Herkunftsangabe die sichere Richtung.
  const anteil = Math.min(amtlicherAnteilProzent(segments), 99);
  return `Amtliche Daten (Kanton/Stadt) für ${anteil} %, sonst Kartendaten (OSM/Mapbox)`;
}
