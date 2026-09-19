import type { TempolimitSegment } from "@/types/database";

// Abgleich einer Streckengeometrie mit amtlichen Tempolimit-Daten der
// Kantone und Städte. Wo eine amtliche Angabe zur Strecke passt, ersetzt ihr
// Wert die aus OSM/Mapbox geschätzte Zahl; das Segment wird amtlich:true und
// trägt die Quelle. Alles andere bleibt, wie es war.
//
// Zwei Aufrufer teilen sich diese Datei: lib/amtlicheTempolimits.ts beim
// Anlegen einer Strecke (Daten aus der Tabelle amtliche_tempolimits, 0102)
// und scripts/enrich-amtliche-tempolimits.mjs für bestehende Strecken (Daten
// direkt von den Diensten). Das Skript lädt die Datei über Node's
// Type-Stripping — deshalb hier nur löschbare TypeScript-Syntax (keine enums,
// keine Parameter-Properties) und ausser dem reinen Typ-Import keine
// Abhängigkeiten.
//
// Gerechnet wird in LV95 (EPSG:2056, Meter): alle amtlichen Quellen liefern
// nativ darin, und Abstände lassen sich mit Pythagoras bestimmen.

export type Lv95 = [number, number];

// amtlich: false für OpenStreetMap — der Wert gilt trotzdem als bekannt,
// aber nicht als amtlich (siehe scripts/amtliche-tempolimits/quellen.mjs).
type Gemeinsam = { quelle: string; rang: number; randM: number; kmh: number; amtlich?: boolean };

export type AmtlichesObjekt =
  | (Gemeinsam & { linien: Lv95[][] })
  | (Gemeinsam & { flaechen: Lv95[][][] });

// GPS-/Digitalisierungsabstand, bis zu dem eine amtliche Achse als dieselbe
// Strasse gilt — derselbe Wert wie im früheren Zürcher Skript.
export const MATCH_TOLERANZ_M = 20;
// Bis zu welchem Winkel zwei Strecken als gleich gerichtet gelten. Eine
// querende Strasse (Kreuzung, Brücke) liegt auch unter 20m, verläuft aber
// quer und darf das Limit nicht übernehmen.
const MAX_WINKEL_GRAD = 35;
// Plausible Schweizer Höchstgeschwindigkeiten; 15 (Fussgängerzone) oder 0
// (Fahrverbot) sind für Autos kein befahrbares Limit.
export const MIN_KMH = 20;
export const MAX_KMH = 120;
// Kurze Aussetzer innerhalb eines amtlichen Abschnitts (ein Stützpunkt im
// Kreisel, eine Lücke in der Achse an einer Einmündung) werden aufgefüllt,
// sofern beide Seiten dieselbe Quelle und denselben Wert tragen.
const MAX_LUECKE_KM = 0.05;
const RASTER_M = 200;

// --- Geometrie ---------------------------------------------------------------

// Approximierte WGS84 → LV95-Transformation (swisstopo-Formel, ~1m
// Genauigkeit) — dieselbe wie in lib/elevation.ts.
export function wgs84ToLv95([lon, lat]: [number, number]): Lv95 {
  const latSec = (lat * 3600 - 169028.66) / 10000;
  const lonSec = (lon * 3600 - 26782.5) / 10000;
  const E =
    2600072.37 +
    211455.93 * lonSec -
    10938.51 * lonSec * latSec -
    0.36 * lonSec * latSec * latSec -
    44.54 * lonSec ** 3;
  const N =
    1200147.07 +
    308807.95 * latSec +
    3745.25 * lonSec ** 2 +
    76.63 * latSec ** 2 -
    194.56 * lonSec ** 2 * latSec +
    119.79 * latSec ** 3;
  return [E, N];
}

function distanzZuStrecke([px, py]: Lv95, [ax, ay]: Lv95, [bx, by]: Lv95): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

// Richtungsunterschied zweier Strecken in Grad, ohne Fahrtrichtung (0–90°):
// eine Strasse ist in beide Richtungen dieselbe Strasse.
function richtungsdifferenz(a: Lv95, b: Lv95, c: Lv95, d: Lv95): number {
  const w1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const w2 = Math.atan2(d[1] - c[1], d[0] - c[0]);
  let diff = Math.abs(w1 - w2) % Math.PI;
  if (diff > Math.PI / 2) diff = Math.PI - diff;
  return (diff * 180) / Math.PI;
}

// Gerade-Ungerade-Regel über alle Ringe: Löcher fallen damit heraus, egal in
// welcher Umlaufrichtung eine Quelle sie liefert.
function punktInRingen([px, py]: Lv95, rings: Lv95[][]): boolean {
  let innen = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) innen = !innen;
    }
  }
  return innen;
}

function abstandZuRand(p: Lv95, rings: Lv95[][]): number {
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) min = Math.min(min, distanzZuStrecke(p, ring[i - 1], ring[i]));
  }
  return min;
}

export function bbox(punkte: Lv95[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of punkte) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function haversineM([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

// --- Index -------------------------------------------------------------------

type Eintrag =
  | { typ: "strecke"; objekt: AmtlichesObjekt; a: Lv95; b: Lv95 }
  | { typ: "flaeche"; objekt: AmtlichesObjekt; rings: Lv95[][] };

// Rasterverzeichnis: jede Linienstrecke bzw. Fläche steht in allen Zellen, die
// ihre Bounding-Box berührt. Ohne das wäre der Abgleich quadratisch — die
// Stadt Zürich allein hat Tausende Abschnitte.
export class AmtlicherIndex {
  #zellen = new Map<string, Eintrag[]>();

  constructor(objekte: AmtlichesObjekt[]) {
    for (const objekt of objekte) {
      if (objekt.kmh < MIN_KMH || objekt.kmh > MAX_KMH) continue;
      if ("linien" in objekt) {
        for (const linie of objekt.linien) {
          for (let i = 1; i < linie.length; i++) {
            const [minX, minY, maxX, maxY] = bbox([linie[i - 1], linie[i]]);
            const t = MATCH_TOLERANZ_M;
            this.#eintragen({ typ: "strecke", objekt, a: linie[i - 1], b: linie[i] }, [minX - t, minY - t, maxX + t, maxY + t]);
          }
        }
      } else {
        for (const rings of objekt.flaechen) {
          this.#eintragen({ typ: "flaeche", objekt, rings }, bbox(rings.flat()));
        }
      }
    }
  }

  #eintragen(e: Eintrag, [minX, minY, maxX, maxY]: number[]) {
    for (let ix = Math.floor(minX / RASTER_M); ix <= Math.floor(maxX / RASTER_M); ix++) {
      for (let iy = Math.floor(minY / RASTER_M); iy <= Math.floor(maxY / RASTER_M); iy++) {
        const k = `${ix}|${iy}`;
        const liste = this.#zellen.get(k);
        if (liste) liste.push(e);
        else this.#zellen.set(k, [e]);
      }
    }
  }

  // Der passende amtliche Wert für Streckenpunkt i, oder null. Bei mehreren
  // Treffern gewinnt der kleinere Rang (kommunal vor kantonal vor Zone),
  // bei gleichem Rang die nähere Achse.
  treffer(punkte: Lv95[], i: number): { objekt: AmtlichesObjekt; dist: number } | null {
    const p = punkte[i];
    const vor = punkte[Math.max(0, i - 1)];
    const nach = punkte[Math.min(punkte.length - 1, i + 1)];
    const k = `${Math.floor(p[0] / RASTER_M)}|${Math.floor(p[1] / RASTER_M)}`;
    let best: { objekt: AmtlichesObjekt; dist: number } | null = null;
    for (const e of this.#zellen.get(k) ?? []) {
      let dist = 0;
      if (e.typ === "strecke") {
        dist = distanzZuStrecke(p, e.a, e.b);
        if (dist > MATCH_TOLERANZ_M) continue;
        if (vor !== nach && richtungsdifferenz(vor, nach, e.a, e.b) > MAX_WINKEL_GRAD) continue;
      } else {
        if (!punktInRingen(p, e.rings)) continue;
        // Tempo-30-Zonen umfassen die Quartierstrassen, nicht die
        // Hauptstrasse an ihrem Rand — ein Punkt knapp innerhalb zählt nicht.
        if (e.objekt.randM > 0 && abstandZuRand(p, e.rings) < e.objekt.randM) continue;
      }
      const r = e.objekt.rang;
      if (!best || r < best.objekt.rang || (r === best.objekt.rang && dist < best.dist)) best = { objekt: e.objekt, dist };
    }
    return best;
  }
}

// --- Abgleich ----------------------------------------------------------------

type Punkt = { km: number; kmh: number; bekannt: boolean; amtlich: boolean; quelle?: string };

// Die Stationierung (km) wird wie in lib/speed.ts sliceRouteBySpeed() über
// Haversine auf den WGS84-Koordinaten gerechnet, damit die Segmentgrenzen
// dort exakt auf Stützpunkte fallen.
export function tempolimitsAbgleichen(
  index: AmtlicherIndex,
  coords: [number, number][],
  basis: TempolimitSegment[],
): TempolimitSegment[] {
  const punkte = coords.map(wgs84ToLv95);
  let km = 0;
  const proPunkt: Punkt[] = coords.map((c, i) => {
    if (i > 0) km += haversineM(coords[i - 1], c) / 1000;
    const t = index.treffer(punkte, i);
    if (t) return { km, kmh: t.objekt.kmh, bekannt: true, amtlich: t.objekt.amtlich !== false, quelle: t.objekt.quelle };
    const alt =
      basis.find((s) => km >= s.km_von - 1e-6 && km <= s.km_bis + 1e-6) ??
      basis[basis.length - 1] ?? { kmh: 80, bekannt: false };
    return { km, kmh: alt.kmh, bekannt: alt.bekannt, amtlich: false };
  });

  lueckenSchliessen(proPunkt);

  // Zwei Durchgänge: erst Punkte zu Segmenten, dann Segmente, die nach dem
  // Runden auf 10m keine Länge haben, entfernen und die dadurch benachbarten
  // gleichen Segmente noch einmal verschmelzen. km_von ist immer km_bis des
  // Vorgängers, damit zwischen zwei Segmenten kein Stück Strecke fehlt.
  const roh: TempolimitSegment[] = [];
  for (const p of proPunkt) {
    const kmR = Number(p.km.toFixed(2));
    const letztes = roh[roh.length - 1];
    if (letztes && gleich(letztes, p)) letztes.km_bis = kmR;
    else roh.push(segment(letztes ? letztes.km_bis : kmR, kmR, p));
  }
  // Auch das erste Segment fällt weg, wenn es keine Länge hat: der erste
  // Streckenpunkt liegt auf km 0, und wenn schon der zweite anders bewertet
  // ist, entstünde sonst ein Segment von 0 bis 0. Das nächste beginnt
  // ohnehin bei 0, die Strecke bleibt also lückenlos.
  const segmente: TempolimitSegment[] = [];
  for (const s of roh.filter((x) => x.km_bis > x.km_von)) {
    const letztes = segmente[segmente.length - 1];
    if (letztes && gleich(letztes, s)) letztes.km_bis = s.km_bis;
    else segmente.push({ ...s, km_von: letztes ? letztes.km_bis : s.km_von });
  }
  return segmente;
}

function segment(km_von: number, km_bis: number, p: Punkt): TempolimitSegment {
  const s: TempolimitSegment = { km_von, km_bis, kmh: p.kmh, bekannt: p.bekannt, amtlich: p.amtlich };
  if (p.quelle) s.quelle = p.quelle;
  return s;
}

function gleich(a: { kmh: number; bekannt: boolean; amtlich?: boolean; quelle?: string }, b: typeof a): boolean {
  return a.kmh === b.kmh && a.bekannt === b.bekannt && !!a.amtlich === !!b.amtlich && a.quelle === b.quelle;
}

function lueckenSchliessen(punkte: Punkt[]) {
  let i = 0;
  while (i < punkte.length) {
    if (punkte[i].amtlich) {
      i++;
      continue;
    }
    let j = i;
    while (j < punkte.length && !punkte[j].amtlich) j++;
    const vor = punkte[i - 1];
    const nach = punkte[j];
    if (vor && nach && vor.kmh === nach.kmh && vor.quelle === nach.quelle && nach.km - vor.km <= MAX_LUECKE_KM) {
      for (let k = i; k < j; k++) punkte[k] = { km: punkte[k].km, kmh: vor.kmh, bekannt: true, amtlich: true, quelle: vor.quelle };
    }
    i = j;
  }
}
