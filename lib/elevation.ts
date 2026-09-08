import { haversineKm } from "@/lib/geo";

// Approximierte WGS84 → LV95-Transformation (swisstopo-Formel, ~1m
// Genauigkeit) — der Höhenprofil-Service verlangt Schweizer Landeskoordinaten.
function wgs84ToLv95([lon, lat]: [number, number]): [number, number] {
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

// Grosszügiger als beim Geocoding: der Dienst rechnet ein Profil über die
// ganze Geometrie, das dauert regulär eine Sekunde oder mehr.
const ELEVATION_TIMEOUT_MS = 8000;

interface ProfilePoint {
  dist: number;
  alts: { COMB: number };
}

// Höhenprofil entlang der Strecke via swisstopo (swissALTI3D, ~2m
// Genauigkeit) — deutlich präziser als globale Gratis-DEMs wie SRTM und
// speziell für Schweizer Koordinaten gedacht. Kostenlos, kein API-Key,
// Fair-Use-Limit 20 Anfragen/Minute.
// Wie viele Stützpunkte swisstopo über die Geometrie legen soll.
//
// 300 war fest verdrahtet, unabhängig von der Länge. Auf einer 20-km-Strecke
// ist das ein Punkt alle ~67 m; auf einer 120-km-Fahrt einer alle 400 m. In
// diesem Raster verschwinden kurze Anstiege vollständig, und was übrig
// bleibt, fällt danach zusätzlich unter MIN_ASCENT_STEP_M. Der summierte
// Anstieg einer langen Fahrt fiel damit um ein Vielfaches zu klein aus — und
// weil die Höhenmeter-Bestenliste Fahrten vergleicht, belohnte das
// Auseinanderschneiden einer langen Fahrt in mehrere kurze.
//
// Deshalb ein fester Abstand statt einer festen Anzahl. Die Untergrenze
// hält kurze Strecken bei der bisherigen Auflösung; die Obergrenze ist ein
// selbst gesetzter Sicherheitsabstand, keine gemessene Grenze des Dienstes —
// sie deckelt Antwortgrösse und Laufzeit gegen ELEVATION_TIMEOUT_MS.
export const SAMPLE_ABSTAND_M = 50;
export const MIN_STUETZPUNKTE = 300;
export const MAX_STUETZPUNKTE = 3000;

export function stuetzpunkteFuer(coords: [number, number][]): number {
  let meter = 0;
  for (let i = 1; i < coords.length; i++) {
    meter += haversineKm(coords[i - 1], coords[i]) * 1000;
  }
  const gewuenscht = Math.ceil(meter / SAMPLE_ABSTAND_M);
  return Math.min(MAX_STUETZPUNKTE, Math.max(MIN_STUETZPUNKTE, gewuenscht));
}

// stuetzpunkte ist bewusst ein Parameter mit dem alten Wert als Vorgabe und
// keine automatische Ableitung: computeHoeheUndSteigung() ist gegen bekannte
// Passwerte auf genau 300 Punkte kalibriert (siehe scripts/enrich-routes.mjs
// — Julier 12%, Susten 9%, Flüela 8%). Ein dichteres Raster verschiebt das
// 90.-Perzentil der Steigung und damit veröffentlichte Streckenkennzahlen.
// Die Dichte anzuheben ist deshalb nur dort richtig, wo der summierte
// Anstieg gefragt ist — bei Fahrten (lib/actions/completions.ts).
export async function fetchElevationProfile(
  coords: [number, number][],
  stuetzpunkte: number = MIN_STUETZPUNKTE,
): Promise<{ dist: number; elevation: number }[] | null> {
  const lv95 = coords.map(wgs84ToLv95);
  const geom = JSON.stringify({ type: "LineString", coordinates: lv95 });
  const body = new URLSearchParams({ geom, sr: "2056", nb_points: String(stuetzpunkte) });

  // Mit Frist, und jeder Fehler wird zu null: das Höhenprofil ist Beiwerk.
  // Ein stockender oder ausgefallener swisstopo-Aufruf darf weder das
  // Speichern einer Fahrt noch einen Streckenvorschlag aufhalten — beide
  // Aufrufer in lib/actions/ rechnen mit null und veröffentlichen dann eben
  // ohne diese Werte. Bisher wurde nur ein "nicht ok"-Status abgefangen, ein
  // Netzwerkfehler dagegen bis in die Server Action durchgereicht.
  try {
    const res = await fetch("https://api3.geo.admin.ch/rest/services/profile.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(ELEVATION_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as ProfilePoint[] | unknown;
    if (!Array.isArray(json)) return null;

    return json.map((p) => ({ dist: p.dist, elevation: p.alts.COMB }));
  } catch {
    return null;
  }
}

// 3-Punkt-Median unterdrückt einzelne Ausreisser (z. B. Tunnel-/Brücken-
// abschnitte, wo die Geländeoberfläche über der Strasse liegt).
function medianSmooth(values: number[]): number[] {
  if (values.length < 3) return values.slice();
  const out = [values[0]];
  for (let i = 1; i < values.length - 1; i++) {
    out.push([values[i - 1], values[i], values[i + 1]].sort((a, b) => a - b)[1]);
  }
  out.push(values[values.length - 1]);
  return out;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// Scheitelhöhe + maximale Steigung aus dem Höhenprofil. Steigung: 90.
// Perzentil über ein 150m-Fenster (nicht das absolute Maximum) — einzelne
// Tunnel-/Brücken-Segmente erzeugen sonst unrealistische Ausreisser, siehe
// scripts/enrich-routes.mjs für die Kalibrierung gegen bekannte Passwerte
// (Julier 12%, Susten 9%, Flüela 8% — alle innerhalb weniger Prozentpunkte
// getroffen).
export function computeHoeheUndSteigung(profile: { dist: number; elevation: number }[]): {
  hoeheM: number;
  maxSteigungProzent: number;
} {
  const elevations = profile.map((p) => p.elevation);
  const dists = profile.map((p) => p.dist);
  const smoothed = medianSmooth(elevations);
  const hoeheM = Math.round(Math.max(...smoothed));

  const windowM = 150;
  const grads: number[] = [];
  let start = 0;
  for (let end = 1; end < dists.length; end++) {
    while (dists[end] - dists[start] > windowM && start < end - 1) start++;
    const dist = dists[end] - dists[start];
    if (dist < windowM * 0.5) continue;
    const dElev = Math.abs(smoothed[end] - smoothed[start]);
    grads.push((dElev / dist) * 100);
  }

  const maxSteigungProzent = grads.length ? Number(percentile(grads, 90).toFixed(1)) : 0;
  return { hoeheM, maxSteigungProzent };
}

// Summierter Anstieg über das gesamte Profil (die Zahl, die bei einer freien
// Fahrt an die Stelle der Scheitelhöhe einer Strecke tritt — dort ist
// routes.hoehe_m gemeint, das ist bewusst eine andere Grösse und wird
// nirgends mit dieser vermischt).
//
// Gerechnet wird auf dem geglätteten Profil und erst ab einer Mindest-
// Höhendifferenz: rohe Höhendaten schwanken auch auf ebener Strecke um
// wenige Meter, und ohne Schwelle summierten sich diese Schwankungen über
// eine lange Fahrt zu hunderten frei erfundener Höhenmeter.
const MIN_ASCENT_STEP_M = 3;

export function computeAscentM(profile: { dist: number; elevation: number }[]): number {
  if (profile.length < 2) return 0;
  const smoothed = medianSmooth(profile.map((p) => p.elevation));
  let ascent = 0;
  let reference = smoothed[0];
  for (const elevation of smoothed) {
    const delta = elevation - reference;
    if (delta >= MIN_ASCENT_STEP_M) {
      ascent += delta;
      reference = elevation;
    } else if (delta < 0) {
      reference = elevation;
    }
  }
  return Math.round(ascent);
}

// Downsampled Höhenprofil fürs Diagramm (ca. 80 Punkte reichen für eine
// glatte Linie, spart Speicher/Payload gegenüber den Rohpunkten — deren
// Anzahl hängt seit stuetzpunkteFuer() an der Länge und ist nicht mehr
// zwingend 300).
export function buildHoehenprofil(
  profile: { dist: number; elevation: number }[],
  targetPoints = 80,
): { km: number; m: number }[] {
  const smoothed = medianSmooth(profile.map((p) => p.elevation));
  const step = Math.max(1, Math.floor(profile.length / targetPoints));
  const points: { km: number; m: number }[] = [];
  for (let i = 0; i < profile.length; i += step) {
    points.push({ km: Number((profile[i].dist / 1000).toFixed(2)), m: Math.round(smoothed[i]) });
  }
  const last = profile.length - 1;
  if (points[points.length - 1]?.km !== Number((profile[last].dist / 1000).toFixed(2))) {
    points.push({ km: Number((profile[last].dist / 1000).toFixed(2)), m: Math.round(smoothed[last]) });
  }
  return points;
}

// Schätzt die Höhe an der aktuellen Position während einer laufenden
// GPS-Aufzeichnung, per linearer Interpolation im vorab berechneten
// Höhenprofil der Strecke (swisstopo-basiert, siehe oben) — deutlich
// verlässlicher als die oft fehlende/verrauschte GPS-Höhe des Browsers.
// Nutzt die zurückgelegte Distanz als Näherung für die Position entlang der
// Strecke (kein echtes Map-Matching).
export function interpolateElevation(
  hoehenprofil: { km: number; m: number }[],
  km: number,
): number | null {
  if (hoehenprofil.length === 0) return null;
  if (km <= hoehenprofil[0].km) return hoehenprofil[0].m;

  const last = hoehenprofil[hoehenprofil.length - 1];
  if (km >= last.km) return last.m;

  for (let i = 1; i < hoehenprofil.length; i++) {
    if (km <= hoehenprofil[i].km) {
      const prev = hoehenprofil[i - 1];
      const cur = hoehenprofil[i];
      const span = cur.km - prev.km;
      const t = span > 0 ? (km - prev.km) / span : 0;
      return Math.round(prev.m + t * (cur.m - prev.m));
    }
  }
  return last.m;
}

function bearing([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function resampleByDistance(coords: [number, number][], stepM: number): [number, number][] {
  const out: [number, number][] = [coords[0]];
  let carry = 0;
  for (let i = 1; i < coords.length; i++) {
    const segStart = coords[i - 1];
    const segEnd = coords[i];
    const segLen = haversineKm(segStart, segEnd) * 1000;
    let segCovered = 0;
    while (carry + (segLen - segCovered) >= stepM) {
      const need = stepM - carry;
      const t = (segCovered + need) / segLen;
      out.push([segStart[0] + (segEnd[0] - segStart[0]) * t, segStart[1] + (segEnd[1] - segStart[1]) * t]);
      segCovered += need;
      carry = 0;
    }
    carry += segLen - segCovered;
  }
  return out;
}

// Kalibriert gegen bekannte Kehrenzahlen (Julierpass: 26 laut quaeldich.de —
// exakt getroffen; Klausenpass: 26 auf dem kürzeren Teilstück, plausibel).
// Serpentinen erkennen: Peilung über ein 80m-Fenster vor/hinter jedem Punkt
// vergleichen, starke Richtungsumkehr (>80°) als Kandidat werten, dicht
// beieinanderliegende Kandidaten (<60m) zu einer Kehre zusammenfassen.
export function countKehren(coords: [number, number][]): number {
  const step = 15;
  const windowM = 80;
  const threshold = 80;
  const minGapM = 60;

  const even = resampleByDistance(coords, step);
  const n = Math.round(windowM / step);
  if (even.length < 2 * n + 1) return 0;

  const turns: { distM: number; turn: number }[] = [];
  for (let i = n; i < even.length - n; i++) {
    const bBehind = bearing(even[i - n], even[i]);
    const bAhead = bearing(even[i], even[i + n]);
    turns.push({ distM: i * step, turn: angleDiff(bAhead, bBehind) });
  }

  const candidates = turns.filter(
    (t, i) => t.turn > threshold && t.turn >= (turns[i - 1]?.turn ?? 0) && t.turn >= (turns[i + 1]?.turn ?? 0),
  );

  const merged: typeof candidates = [];
  for (const c of candidates) {
    const last = merged[merged.length - 1];
    if (last && c.distM - last.distM < minGapM) {
      if (c.turn > last.turn) merged[merged.length - 1] = c;
    } else {
      merged.push(c);
    }
  }

  return merged.length;
}
