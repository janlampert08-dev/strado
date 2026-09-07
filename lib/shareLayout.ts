// Reine Layout-Rechnung für das Teilen-Bild (lib/shareImage.ts), ohne
// Canvas — damit sie unter Vitest (environment: "node") prüfbar bleibt. Alles,
// was einen 2D-Kontext braucht, bleibt drüben.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Projiziert [lng,lat]-Koordinaten auf Canvas-Pixel: einfache äquirektangulare
// Näherung mit Breitengrad-Korrektur (cos(avgLat)) reicht für den kleinen
// geografischen Ausschnitt einer einzelnen Schweizer Passstrasse völlig aus.
// Das Seitenverhältnis bleibt erhalten; die Linie wird in der Box zentriert
// und füllt sie entlang der längeren Achse aus.
export function projectRoute(coordinates: [number, number][], box: Box): [number, number][] {
  const lats = coordinates.map((c) => c[1]);
  const avgLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);

  const xs = coordinates.map((c) => c[0] * cosLat);
  const ys = coordinates.map((c) => c[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;

  const scale = Math.min(box.w / spanX, box.h / spanY);
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return xs.map((x, i) => [centerX + (x - midX) * scale, centerY - (ys[i] - midY) * scale]);
}

export interface Column {
  x: number;
  w: number;
}

// Teilt die Inhaltsbreite (Gesamtbreite minus Rand links und rechts) in
// gleich breite, lückenlos anschliessende Spalten. Die Trennlinien zwischen
// den Kennzahlen sitzen genau auf den Spaltengrenzen, also bei x jeder
// Spalte ausser der ersten.
export function statsColumns(width: number, pad: number, count: number): Column[] {
  const w = (width - pad * 2) / count;
  return Array.from({ length: count }, (_, i) => ({ x: pad + i * w, w }));
}
