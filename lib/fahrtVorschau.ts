import { haversineKm } from "@/lib/geo";

// Tempo der Strecken-Vorschau ("Strecke abfahren"): die Kamera folgt der
// Linie wie ein Auto — in Kurven langsam, auf Geraden schnell.
//
// Reine Mathematik ohne Mapbox-Abhängigkeit, damit Vitest sie prüfen kann.
// Die Animation selbst (requestAnimationFrame + jumpTo) steht in
// components/RouteMap.tsx und liest nur diese Tabelle.

export interface FlugPunkt {
  punkt: [number, number];
  /** Fahrtrichtung in Grad, 0 = Nord, Uhrzeigersinn. */
  kurs: number;
  /** Kumulierte Meter ab Start. */
  dist: number;
  /** Sekunden ab Start bei Vorschau-Tempo. */
  zeit: number;
}

// Geradeaus-Tempo in m/s. Keine echten km/h: die Vorschau soll eine Strecke
// in unter einer Minute abfahren, sich aber ANFÜHLEN wie Fahren — das
// Verhältnis Kurve zu Gerade zählt, nicht der Tacho.
const TEMPO_GERADE_MS = 900;
const TEMPO_MIN_MS = 160;
// Über dieses Fenster wird Krümmung UND Kurs geglättet: ein einzelner
// Geometrie-Knick (Routing-Artefakt) bremst nicht und reisst die Kamera
// nicht herum, eine Kehre schon.
const GLAETTUNG = 5;
// Länger dauert keine Vorschau — darüber wird proportional beschleunigt,
// statt die Geduld zu testen.
const MAX_DAUER_S = 60;

function kursZwischen(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Kürzeste Differenz zweier Kurse in Radiant, 0..π. */
function kursDifferenz(aGrad: number, bGrad: number): number {
  const d = Math.abs(aGrad - bGrad) % 360;
  return ((d > 180 ? 360 - d : d) * Math.PI) / 180;
}

/** Kurs mitteln mit RICHTIGEM Umgang um 0°/360° (Vektor-Mittel). */
function kurseMitteln(kurse: number[]): number {
  let x = 0;
  let y = 0;
  for (const k of kurse) {
    const r = (k * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Baut die Flug-Tabelle: pro Geometrie-Punkt Tempo aus der lokalen
 * Krümmung (Winkel zwischen ankommendem und abgehendem Segment, geglättet)
 * und daraus die kumulierte Flugzeit.
 *
 * Schärfe 0 (gerade) → volles Tempo, Schärfe 1 (Kehre, 180°) → Minimum.
 * Weniger als zwei Punkte → leere Tabelle.
 */
export function berechneFlugTabelle(coords: [number, number][]): FlugPunkt[] {
  if (coords.length < 2) return [];

  const n = coords.length;
  const segmentLaengeM: number[] = [];
  const segmentKurs: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    segmentLaengeM.push(haversineKm(coords[i], coords[i + 1]) * 1000);
    segmentKurs.push(kursZwischen(coords[i], coords[i + 1]));
  }

  // Krümmung am Punkt i: Winkel zwischen Segment i-1 und i. Start und Ende
  // fahren geradeaus los bzw. aus.
  const rohSchaerfe: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      rohSchaerfe.push(0);
    } else {
      rohSchaerfe.push(kursDifferenz(segmentKurs[i - 1], segmentKurs[i]) / Math.PI);
    }
  }

  const halb = Math.floor(GLAETTUNG / 2);
  const tempo: number[] = [];
  const kursGlaettet: number[] = [];
  for (let i = 0; i < n; i++) {
    let summe = 0;
    let anzahl = 0;
    const kurse: number[] = [];
    for (let k = Math.max(0, i - halb); k <= Math.min(n - 1, i + halb); k++) {
      summe += rohSchaerfe[k];
      anzahl++;
      // Kurs am Punkt: Mittel aus ankommendem und abgehendem Segment.
      if (k > 0) kurse.push(segmentKurs[k - 1]);
      if (k < n - 1) kurse.push(segmentKurs[k]);
    }
    const schaerfe = summe / anzahl;
    tempo.push(Math.max(TEMPO_MIN_MS, TEMPO_GERADE_MS * (1 - schaerfe) ** 1.5));
    kursGlaettet.push(kurseMitteln(kurse.length > 0 ? kurse : [segmentKurs[Math.min(i, n - 2)]]));
  }

  const punkte: FlugPunkt[] = [];
  let dist = 0;
  let zeit = 0;
  for (let i = 0; i < n; i++) {
    punkte.push({ punkt: coords[i], kurs: kursGlaettet[i], dist, zeit });
    if (i < n - 1) {
      dist += segmentLaengeM[i];
      zeit += segmentLaengeM[i] / tempo[i];
    }
  }

  // Zu lange Vorschau proportional beschleunigen — das Verhältnis
  // Kurve/Gerade bleibt, nur der Tacho steigt.
  if (zeit > MAX_DAUER_S) {
    const faktor = MAX_DAUER_S / zeit;
    for (const p of punkte) p.zeit *= faktor;
  }

  return punkte;
}

/**
 * Position zur Flugzeit: linear zwischen den Tabellenpunkten, Kurs auf dem
 * kürzesten Weg. Vor Start → Startpunkt, nach Ende → null (Flug vorbei).
 */
export function positionBei(
  tabelle: FlugPunkt[],
  sekunden: number,
): { punkt: [number, number]; kurs: number } | null {
  if (tabelle.length === 0) return null;
  if (sekunden <= 0) return { punkt: tabelle[0].punkt, kurs: tabelle[0].kurs };
  const letzte = tabelle[tabelle.length - 1];
  if (sekunden >= letzte.zeit) return null;

  let lo = 0;
  let hi = tabelle.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (tabelle[mid].zeit <= sekunden) lo = mid;
    else hi = mid;
  }
  const a = tabelle[lo];
  const b = tabelle[hi];
  const spanne = b.zeit - a.zeit;
  const anteil = spanne > 0 ? (sekunden - a.zeit) / spanne : 0;
  const punkt: [number, number] = [
    a.punkt[0] + (b.punkt[0] - a.punkt[0]) * anteil,
    a.punkt[1] + (b.punkt[1] - a.punkt[1]) * anteil,
  ];
  // Kurs auf dem kürzesten Weg überblenden (kein 350°→10°-Rundlauf).
  let d = (b.kurs - a.kurs) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return { punkt, kurs: (a.kurs + d * anteil + 360) % 360 };
}
