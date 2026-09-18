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

// Ein Grad Breite in Kilometern — genug Genauigkeit für einen Massstabsbalken
// auf einem Teilen-Bild, und dieselbe Näherung, mit der projectRoute die
// Länge über cos(Breite) korrigiert.
const KM_PRO_GRAD = 111.32;

// "Runde" Balkenlängen, wie sie auf Landeskarten stehen.
const MASSSTAB_STUFEN_KM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];

/**
 * Massstabsbalken zur Projektion von projectRoute: welche runde Distanz in
 * Kilometern ungefähr `zielPx` Pixel lang ist, und wie lang genau.
 *
 * Der Balken ist die ehrliche Form von "präzise": eine Angabe, die stimmt,
 * statt einer Verzierung, die nach Karte aussieht. Gewählt wird die grösste
 * Stufe, die nicht länger als `zielPx` wird — ist schon die kleinste zu lang,
 * dann eben die kleinste.
 */
export function massstab(
  coordinates: [number, number][],
  box: Box,
  zielPx = 180,
): { km: number; px: number } | null {
  if (coordinates.length < 2) return null;
  const lats = coordinates.map((c) => c[1]);
  const avgLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const xs = coordinates.map((c) => c[0] * cosLat);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1e-6;
  const spanY = Math.max(...lats) - Math.min(...lats) || 1e-6;
  const pxProGrad = Math.min(box.w / spanX, box.h / spanY);
  const pxProKm = pxProGrad / KM_PRO_GRAD;
  if (!Number.isFinite(pxProKm) || pxProKm <= 0) return null;
  const passend = MASSSTAB_STUFEN_KM.filter((km) => km * pxProKm <= zielPx);
  const km = passend.length > 0 ? passend[passend.length - 1] : MASSSTAB_STUFEN_KM[0];
  return { km, px: km * pxProKm };
}

/**
 * Höhenprofil als Punktfolge in einer Box: Kilometer nach rechts, Meter nach
 * oben, der tiefste Punkt auf der Unterkante. Eine flache Strecke bekommt
 * trotzdem eine sichtbare Mindesthöhe von 12 % der Box, statt als Strich auf
 * dem Boden zu kleben — sonst sähe eine 20-Höhenmeter-Runde aus wie ein
 * fehlendes Profil.
 */
export function profilPunkte(
  punkte: { km: number; m: number }[],
  box: Box,
): [number, number][] {
  if (punkte.length < 2) return [];
  const kmMax = punkte[punkte.length - 1].km || 1;
  const mMin = Math.min(...punkte.map((p) => p.m));
  const mMax = Math.max(...punkte.map((p) => p.m));
  const spanne = Math.max(mMax - mMin, 1);
  const minHoehe = box.h * 0.12;
  return punkte.map((p) => {
    const anteil = (p.m - mMin) / spanne;
    const y = box.y + box.h - (minHoehe + anteil * (box.h - minHoehe));
    return [box.x + (p.km / kmMax) * box.w, y];
  });
}
