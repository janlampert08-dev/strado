// Kartenhintergrund für das Teilen-Bild (lib/shareImage.ts).
//
// Reine Rechnung plus ein Bildlader, bewusst ohne Canvas: die Mathematik
// bleibt damit unter Vitest (environment: "node") prüfbar, nur
// ladeKartenbild() braucht das DOM.
//
// Warum Web-Mercator statt projectRoute (lib/shareLayout.ts): die Kacheln
// von Mapbox liegen in Web-Mercator vor. Würde die Linie weiter mit der
// äquirektangularen Näherung projiziert, läge sie auf dem Kartenbild umso
// weiter neben der Strasse, je grösser der Ausschnitt ist. Deshalb wird der
// Track hier in derselben Projektion auf die Box abgebildet, in der das
// Standbild angefordert wurde — Bbox und Pixelabbildung teilen sich eine
// Funktion, damit sie nicht auseinanderlaufen können.

export interface KartenBbox {
  west: number;
  sued: number;
  ost: number;
  nord: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Erdradius der Web-Mercator-Kugel (EPSG:3857), in Metern.
const R = 6378137;
// Strecken, deren Ausdehnung darunter liegt, bekommen diese Mindestspanne,
// damit Bbox und Zoom nicht entarten (ca. 220 m am Äquator).
const MIN_SPANNE_M = 220;
// Luft um die Linie, damit der Track nicht an der Bildkante klebt — Anteil
// je Seite, zusätzlich zum Seitenverhältnis-Ausgleich unten.
const PAD_ANTEIL = 0.15;
// Mapbox Static Images nimmt höchstens 1280 px je Seite (retina darüber).
const MAX_KANTE_PX = 1280;

function mercX(lon: number): number {
  return ((lon * Math.PI) / 180) * R;
}

function mercY(lat: number): number {
  const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + phi / 2)) * R;
}

function lonAusX(x: number): number {
  return ((x / R) * 180) / Math.PI;
}

function latAusY(y: number): number {
  return ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;
}

/**
 * Bbox um die Koordinaten, die ohne Verzerrung in eine Box mit
 * `zielVerhaeltnis` (Breite/Höhe) passt: in Mercator-Metern gemessen,
 * gepolstert und auf das Zielverhältnis erweitert. Wer das Standbild mit
 * dieser Bbox anfordert und die Linie mit kartenPunkte() auf dieselbe Box
 * legt, bekommt beides deckungsgleich.
 */
export function bboxFuerRoute(
  coordinates: [number, number][],
  zielVerhaeltnis: number,
  padAnteil = PAD_ANTEIL,
): KartenBbox {
  const xs = coordinates.map(([lon]) => mercX(lon));
  const ys = coordinates.map(([, lat]) => mercY(lat));
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  let spanX = Math.max(maxX - minX, MIN_SPANNE_M);
  let spanY = Math.max(maxY - minY, MIN_SPANNE_M);
  const mitX = (minX + maxX) / 2;
  const mitY = (minY + maxY) / 2;

  // Erst polstern, dann aufs Zielverhältnis erweitern — nie stauchen.
  spanX *= 1 + padAnteil * 2;
  spanY *= 1 + padAnteil * 2;
  const verhaeltnis = Number.isFinite(zielVerhaeltnis) && zielVerhaeltnis > 0 ? zielVerhaeltnis : 1;
  if (spanX / spanY < verhaeltnis) spanX = spanY * verhaeltnis;
  else spanY = spanX / verhaeltnis;

  minX = mitX - spanX / 2;
  maxX = mitX + spanX / 2;
  minY = mitY - spanY / 2;
  maxY = mitY + spanY / 2;

  return {
    west: Math.max(-180, lonAusX(minX)),
    sued: Math.max(-85, latAusY(minY)),
    ost: Math.min(180, lonAusX(maxX)),
    nord: Math.min(85, latAusY(maxY)),
  };
}

/**
 * Bildet [lng,lat]-Koordinaten auf Pixel einer Box ab — dieselbe Abbildung,
 * mit der die Bbox oben gebaut wurde, also deckungsgleich mit dem Standbild
 * dieser Bbox in dieser Box.
 */
export function kartenPunkte(
  coordinates: [number, number][],
  bbox: KartenBbox,
  box: Box,
): [number, number][] {
  const minX = mercX(bbox.west);
  const maxX = mercX(bbox.ost);
  const minY = mercY(bbox.sued);
  const maxY = mercY(bbox.nord);
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  return coordinates.map(([lon, lat]) => [
    box.x + ((mercX(lon) - minX) / spanX) * box.w,
    box.y + ((maxY - mercY(lat)) / spanY) * box.h,
  ]);
}

/**
 * Mapbox-Static-Images-URL für eine Bbox in exakt `breite × hoehe` Pixeln.
 * `logo=false&attribution=false`, weil das Teilen-Bild die vorgeschriebene
 * Nennung selbst einbrennt (lib/shareImage.ts) statt Mapbox' Ecke zu
 * übernehmen.
 */
export function staticKartenUrl(
  bbox: KartenBbox,
  breite: number,
  hoehe: number,
  token: string,
  stil = "mapbox/dark-v11",
): string {
  const w = Math.max(1, Math.min(MAX_KANTE_PX, Math.round(breite)));
  const h = Math.max(1, Math.min(MAX_KANTE_PX, Math.round(hoehe)));
  const r = (n: number) => (Math.round(n * 1e5) / 1e5).toFixed(5);
  const rahmen = `${r(bbox.west)},${r(bbox.sued)},${r(bbox.ost)},${r(bbox.nord)}`;
  return (
    `https://api.mapbox.com/styles/v1/${stil}/static/${rahmen}/${w}x${h}` +
    `?access_token=${encodeURIComponent(token)}&logo=false&attribution=false`
  );
}

/**
 * Lädt das Standbild so, dass das Canvas danach nicht "tainted" ist: nur mit
 * CORS (crossOrigin) gezeichnet bleibt toBlob() erlaubt. Schlägt das Laden
 * fehl — kein Token, kein Netz, keine ACAO-Antwort — wirft die Funktion,
 * und der Aufrufer fällt auf den bisherigen Hintergrund ohne Karte zurück.
 */
export function ladeKartenbild(url: string, timeoutMs = 8000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => reject(new Error("Kartenbild-Timeout.")), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Kartenbild konnte nicht geladen werden."));
    };
    img.src = url;
  });
}
