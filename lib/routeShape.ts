import type { HoehenprofilPunkt } from "@/types/database";

// Wandelt das Höhenprofil einer Strecke in einen kompakten SVG-Pfad um — als
// Hintergrund-Silhouette in der Streckenliste. Im Gegensatz zu routeShapePath
// (unten) wird die x/y-Achse UNABHÄNGIG voneinander auf viewWidth/viewHeight
// gestreckt (kein gemeinsamer Massstab wie bei km/m ohnehin sinnvoll wäre) —
// dadurch füllt jedes Profil dieselbe Fläche unabhängig von der tatsächlichen
// Streckenlänge/Höhendifferenz, was optisch deutlich konsistenter wirkt als
// die stark unterschiedlich "grossen" Luftlinien-Silhouetten je nach
// Streckenform.
export function elevationShapePath(
  punkte: HoehenprofilPunkt[],
  viewWidth = 160,
  viewHeight = 80,
  padding = 6,
): string {
  if (punkte.length < 2) return "";

  const kms = punkte.map((p) => p.km);
  const ms = punkte.map((p) => p.m);
  const minKm = Math.min(...kms);
  const maxKm = Math.max(...kms);
  const minM = Math.min(...ms);
  const maxM = Math.max(...ms);

  const w = maxKm - minKm || 1e-9;
  const h = maxM - minM || 1e-9;

  const availW = viewWidth - padding * 2;
  const availH = viewHeight - padding * 2;

  const points = punkte.map((p) => {
    const x = padding + ((p.km - minKm) / w) * availW;
    // SVG-y wächst nach unten, Höhe nach oben — invertieren.
    const y = padding + (1 - (p.m - minM) / h) * availH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `M${points.join(" L")}`;
}

// Wandelt die Geometrie einer Strecke in einen kompakten SVG-Pfad um — als
// dezente Silhouette im Hintergrund einer Streckenkarte, damit jede Strecke
// schon in der Liste an ihrer (Luftlinien-)Form erkennbar ist, statt nur als
// austauschbare Textzeile.
export function routeShapePath(
  coordinates: [number, number][],
  viewWidth = 160,
  viewHeight = 64,
  padding = 6,
): string {
  if (coordinates.length < 2) return "";

  const lons = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // Meter pro Längengrad hängt vom Breitengrad ab (Kosinus-Korrektur) — ohne
  // sie würde jede Strecke auf Schweizer Breitengraden sichtbar in die Breite
  // gezogen.
  const lonScale = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));

  const w = (maxLon - minLon) * lonScale || 1e-9;
  const h = maxLat - minLat || 1e-9;

  const availW = viewWidth - padding * 2;
  const availH = viewHeight - padding * 2;
  const scale = Math.min(availW / w, availH / h);

  const offsetX = padding + (availW - w * scale) / 2;
  const offsetY = padding + (availH - h * scale) / 2;

  const points = coordinates.map(([lon, lat]) => {
    const x = offsetX + (lon - minLon) * lonScale * scale;
    // SVG-y wächst nach unten, Breitengrad nach Norden — invertieren.
    const y = offsetY + (maxLat - lat) * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `M${points.join(" L")}`;
}
