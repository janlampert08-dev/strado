export type CongestionLevel = "low" | "moderate" | "heavy" | "severe";

const SEVERITY: Record<CongestionLevel, number> = { low: 0, moderate: 1, heavy: 2, severe: 3 };

// Einzige Quelle für Label/Farbe je Stau-Level — vorher in TrafficIndicator,
// RouteMap und RouteDetailMap dreifach dupliziert.
//
// WARUM HEX UND KEINE TOKENS: Die Farben zeichnet zuerst Mapbox — als
// Linienabschnitte der Strecke (RouteDetailMap → trafficSegments →
// RouteMap), und ein Mapbox-Layer nimmt nur fertige Farben, kein
// var(--…). Im DOM stehen sie nur als Legende dieser Linien (Punkt am
// Verkehr-Schalter, Legendenkarte), und eine Legende muss exakt die Farbe
// der Linie tragen. Die vorhandenen Tokens taugen dafür nicht:
// --color-success/-warning/-danger haben andere Werte, wechseln mit dem
// Thema und kennen kein "stark" zwischen gelb und rot. Die Verkehrsfarben
// sind eine Konvention der Kartendarstellung (grün → rot), keine
// App-Semantik. Wer sie zu Tokens macht, braucht vier neue in
// app/globals.css und liest sie für die Karte über tokenFarbe()
// (lib/theme.ts) — beides zusammen, sonst läuft die Legende von der Linie
// weg.
export const CONGESTION_META: Record<CongestionLevel, { label: string; color: string }> = {
  low: { label: "Frei", color: "#22C55E" },
  moderate: { label: "Mässig", color: "#F59E0B" },
  heavy: { label: "Stark", color: "#F97316" },
  severe: { label: "Stau", color: "#B91C1C" },
};

function isCongestionLevel(value: string | undefined): value is CongestionLevel {
  return value === "low" || value === "moderate" || value === "heavy" || value === "severe";
}

// Der ungünstigste (stärkste) gefundene Stau-Level gilt als Gesamtindikator
// — praktisch relevanter als ein Durchschnitt: eine einzelne Verstopfung
// irgendwo auf der Strecke ist die Info, die für die Fahrt zählt.
export function worstCongestion(levels: CongestionLevel[]): CongestionLevel | null {
  if (levels.length === 0) return null;
  return levels.reduce((worst, level) => (SEVERITY[level] > SEVERITY[worst] ? level : worst));
}

// Etwa ein Abfragepunkt pro 800m — genug, um Stauabschnitte sichtbar entlang
// der Strecke einzufärben, ohne bei langen Alpenpässen Hunderte parallele
// Tilequery-Aufrufe auszulösen. Eine Stelle (beide Detailkarten fragen
// gleich): Hintergrundkarte und Verkehrs-Sektion teilen sich die Zahl, damit
// ein Punkt hier exakt seiner Einfärbung dort entspricht.
export const VERKEHR_MIN_SAMPLES = 6;
export const VERKEHR_MAX_SAMPLES = 24;
const VERKEHR_SAMPLES_PRO_KM = 1.2;

export function verkehrSamplesFuerLaenge(laengeKm: number): number {
  return Math.min(
    VERKEHR_MAX_SAMPLES,
    Math.max(VERKEHR_MIN_SAMPLES, Math.round(laengeKm * VERKEHR_SAMPLES_PRO_KM)),
  );
}
// Gleichmässig verteilte Stichproben-Indizes statt jeden einzelnen
// Koordinatenpunkt der (oft sehr dichten) Geometrie abzufragen — hält sowohl
// die Anzahl API-Aufrufe als auch die Anzahl gezeichneter Farbabschnitte klein.
// sampleRoutePoints (Abfragepunkte) und sliceRouteByTraffic (Kartenabschnitte)
// teilen sich diese Indizes, damit ein abgefragter Punkt exakt der Mitte
// seines eingefärbten Abschnitts entspricht.
function sampleIndices(length: number, count: number): number[] {
  if (length === 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

export function sampleRoutePoints(
  coordinates: [number, number][],
  count: number,
): [number, number][] {
  return sampleIndices(coordinates.length, count).map((i) => coordinates[i]);
}

// Teilt die Geometrie in zusammenhängende Abschnitte auf: die Grenze zwischen
// zwei Abschnitten liegt jeweils in der Mitte zwischen zwei benachbarten
// Stichprobenindizes. `levels` muss in derselben Reihenfolge/Länge vorliegen
// wie sampleRoutePoints(coordinates, levels.length) sie geliefert hätte.
export function sliceRouteByTraffic(
  coordinates: [number, number][],
  levels: (CongestionLevel | null)[],
): { coords: [number, number][]; level: CongestionLevel | null }[] {
  const indices = sampleIndices(coordinates.length, levels.length);
  if (indices.length === 0) return [];

  return indices
    .map((idx, i) => {
      const from = i === 0 ? 0 : Math.round((indices[i - 1] + idx) / 2);
      const to =
        i === indices.length - 1
          ? coordinates.length - 1
          : Math.round((idx + indices[i + 1]) / 2);
      return { coords: coordinates.slice(from, to + 1), level: levels[i] };
    })
    .filter((s) => s.coords.length >= 2);
}

const TILEQUERY_RADIUS_M = 30;

// Fragt Mapbox' Tilequery-API an mehreren Punkten entlang der Strecke ab und
// liefert je Punkt den ungünstigsten dort gefundenen Stau-Level (oder null,
// wenn an dieser Stelle keine Verkehrsdaten vorliegen). Einzige Datenquelle
// für sowohl die Gesamt-Einschätzung (worstCongestion über das Ergebnis) als
// auch die eingefärbten Kartenabschnitte (sliceRouteByTraffic) — ersetzt die
// vorherige, komplett separate Verkehrs-Kachelebene auf der Karte.
export async function fetchCongestionLevels(
  coordinates: [number, number][],
  sampleCount: number,
  mapboxToken: string,
): Promise<(CongestionLevel | null)[]> {
  const points = sampleRoutePoints(coordinates, sampleCount);

  return Promise.all(
    points.map(async ([lon, lat]) => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/tilequery/${lon},${lat}.json?radius=${TILEQUERY_RADIUS_M}&layers=traffic&limit=5&access_token=${mapboxToken}`,
        );
        if (!res.ok) return null;
        const data: { features?: { properties?: { congestion?: string } }[] } = await res.json();
        const levels = (data.features ?? [])
          .map((f) => f.properties?.congestion)
          .filter(isCongestionLevel);
        return worstCongestion(levels);
      } catch {
        return null;
      }
    }),
  );
}
