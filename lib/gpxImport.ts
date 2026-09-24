import { haversineKm, type TrailPoint } from "@/lib/geo";
import { MAX_JUMP_KM, MAX_RIDE_SECONDS, MAX_TRAIL_POINTS } from "@/lib/track";

// GPX-Import früherer Fahrten (aus calimoto, Kurviger, Strava, Garmin …).
//
// Wozu: eine neue Fahrerin hat im Winter nichts, das sie aufzeichnen könnte,
// aber meist Jahre an Fahrten in einer anderen App. Importiert zählen sie für
// die eigene Geschichte und die Pass-Sammlung (meine_paesse() geht über den
// Track und das Datum der Fahrt) — und für nichts, das andere sehen.
//
// Was eine importierte Fahrt NICHT kann, und warum:
// - Sie hat keine Serverzeit. Die Zeitstempel stehen in einer Datei, die
//   jeder schreiben kann, also bleibt dauer_quelle "trail" (der Trigger aus
//   0098/0118 setzt das ohne Ticket ohnehin) und die Fahrt steht in keiner
//   Streckenrangliste.
// - Sie bleibt privat. Eine erzeugte GPX-Datei kostet eine Minute, eine
//   echte Aufzeichnung eine Fahrt — öffentlich würde sie die Distanz- und
//   Höhenmeter-Bestenlisten öffnen. Erzwungen in der Datenbank (0124), nicht
//   hier; dieses Modul bereitet nur auf.
//
// Rein und ohne DOM: läuft im Browser (dort wird die Datei gelesen) und in
// Vitest mit environment "node". Kein XML-Parser als Abhängigkeit — GPX ist
// flach genug, und was hier nicht erkannt wird, lehnt die Prüfung ab statt es
// zu erraten.

/** Grösste Datei, die überhaupt gelesen wird. */
export const MAX_GPX_BYTES = 25 * 1024 * 1024;

/** Höchstens so viele Dateien auf einmal. */
export const MAX_GPX_DATEIEN = 20;

/**
 * Punkte je Fahrt, die an den Server gehen. Unter MAX_TRAIL_POINTS, damit
 * die Anfrage klein bleibt — eine Sekunden-Aufzeichnung von Garmin bringt
 * leicht 20 000 Punkte, und die Kennzahlen ändern sich durch das Ausdünnen
 * auf einen Punkt alle paar Sekunden nicht messbar.
 */
export const IMPORT_ZIEL_PUNKTE = 6000;

/** Zeitlücke, ab der eine Datei in zwei Fahrten geteilt wird. */
export const TRENN_LUECKE_SEKUNDEN = 30 * 60;

/** Kürzeste Teilfahrt, die noch als eigene Fahrt taugt. */
export const MIN_TEIL_KM = 1;
const MIN_TEIL_PUNKTE = 5;

export interface GpxFahrt {
  /** Name aus der Datei (trk/name oder metadata/name), sonst null. */
  name: string | null;
  punkte: TrailPoint[];
  distanzKm: number;
  /** Beginn der Fahrt, ms seit Epoche. */
  startMs: number;
  dauerSekunden: number;
}

export type GpxErgebnis =
  | { fahrten: GpxFahrt[]; verworfeneTeile: number }
  | { fehler: string };

const TRKPT_RE = /<(?:[\w-]+:)?trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?trkpt>)/g;
const LAT_RE = /\blat\s*=\s*["']([^"']+)["']/;
const LON_RE = /\blon\s*=\s*["']([^"']+)["']/;
const TIME_RE = /<(?:[\w-]+:)?time>\s*([^<]+?)\s*<\/(?:[\w-]+:)?time>/;
const TRK_NAME_RE = /<(?:[\w-]+:)?trk\b[^>]*>\s*<(?:[\w-]+:)?name>([^<]*)<\/(?:[\w-]+:)?name>/;
const META_NAME_RE =
  /<(?:[\w-]+:)?metadata\b[^>]*>[\s\S]*?<(?:[\w-]+:)?name>([^<]*)<\/(?:[\w-]+:)?name>/;

function entitaetenAufloesen(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function nameAus(xml: string): string | null {
  const roh = TRK_NAME_RE.exec(xml)?.[1] ?? META_NAME_RE.exec(xml)?.[1] ?? null;
  if (roh === null) return null;
  const name = entitaetenAufloesen(roh).replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 80) : null;
}

function distanzKm(punkte: TrailPoint[]): number {
  let km = 0;
  for (let i = 1; i < punkte.length; i++) {
    km += haversineKm([punkte[i - 1].lng, punkte[i - 1].lat], [punkte[i].lng, punkte[i].lat]);
  }
  return km;
}

/**
 * Behält den ersten und den letzten Punkt und dazwischen jeden n-ten, bis
 * höchstens `max` Punkte übrig sind.
 */
export function ausduennen(punkte: TrailPoint[], max: number): TrailPoint[] {
  if (punkte.length <= max) return punkte;
  const schritt = Math.ceil((punkte.length - 1) / (max - 1));
  const ergebnis: TrailPoint[] = [];
  for (let i = 0; i < punkte.length - 1; i += schritt) ergebnis.push(punkte[i]);
  ergebnis.push(punkte[punkte.length - 1]);
  return ergebnis;
}

/**
 * Teilt eine Punktfolge an Sprüngen über MAX_JUMP_KM (Tunnel, pausierte
 * Aufzeichnung) und an Zeitlücken über TRENN_LUECKE_SEKUNDEN (mehrere Tage in
 * einer Datei). Der Server lehnt einen solchen Sprung ohnehin ab — geteilt
 * bleibt von einer Gotthard-Durchfahrt wenigstens die Fahrt davor und danach.
 */
export function anLueckenTeilen(punkte: TrailPoint[]): TrailPoint[][] {
  const teile: TrailPoint[][] = [];
  let aktuell: TrailPoint[] = [];
  for (const p of punkte) {
    const vorher = aktuell[aktuell.length - 1];
    if (
      vorher &&
      (haversineKm([vorher.lng, vorher.lat], [p.lng, p.lat]) > MAX_JUMP_KM ||
        (p.t - vorher.t) / 1000 > TRENN_LUECKE_SEKUNDEN)
    ) {
      teile.push(aktuell);
      aktuell = [];
    }
    aktuell.push(p);
  }
  if (aktuell.length > 0) teile.push(aktuell);
  return teile;
}

/** Liest eine GPX-Datei und bereitet sie als eine oder mehrere Fahrten auf. */
export function gpxLesen(xml: string): GpxErgebnis {
  if (!/<(?:[\w-]+:)?gpx\b/.test(xml)) {
    return { fehler: "Das ist keine GPX-Datei." };
  }

  const roh: TrailPoint[] = [];
  let ohneZeit = 0;
  for (const treffer of xml.matchAll(TRKPT_RE)) {
    const attribute = treffer[1] ?? "";
    const inhalt = treffer[2] ?? "";
    const lat = Number(LAT_RE.exec(attribute)?.[1]);
    const lng = Number(LON_RE.exec(attribute)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      continue;
    }
    const zeit = TIME_RE.exec(inhalt)?.[1];
    const t = zeit ? Date.parse(zeit) : Number.NaN;
    if (!Number.isFinite(t)) {
      ohneZeit++;
      continue;
    }
    roh.push({ lng, lat, t });
  }

  if (roh.length === 0) {
    if (ohneZeit > 0) {
      return {
        fehler:
          "Die Datei enthält keine Zeitstempel. Importieren lassen sich nur gefahrene Aufzeichnungen, keine geplanten Routen.",
      };
    }
    if (/<(?:[\w-]+:)?rtept\b/.test(xml)) {
      return {
        fehler:
          "Das ist eine geplante Route, keine gefahrene Aufzeichnung. Exportiere in der anderen App die aufgezeichnete Fahrt.",
      };
    }
    return { fehler: "Die Datei enthält keinen Track." };
  }

  // Zeitlich sortieren und Doppelte verwerfen: mehrere trkseg einer Datei
  // stehen nicht immer in der Reihenfolge, in der sie gefahren wurden, und
  // Geräte schreiben bei Stillstand gern denselben Zeitstempel zweimal. Der
  // Server verlangt streng aufsteigende Zeiten (parseTrail).
  roh.sort((a, b) => a.t - b.t);
  const punkte: TrailPoint[] = [];
  for (const p of roh) {
    if (punkte.length === 0 || p.t > punkte[punkte.length - 1].t) punkte.push(p);
  }

  const name = nameAus(xml);
  const fahrten: GpxFahrt[] = [];
  let verworfeneTeile = 0;
  for (const teil of anLueckenTeilen(punkte)) {
    const km = distanzKm(teil);
    const dauerSekunden = (teil[teil.length - 1].t - teil[0].t) / 1000;
    if (teil.length < MIN_TEIL_PUNKTE || km < MIN_TEIL_KM || dauerSekunden <= 0) {
      verworfeneTeile++;
      continue;
    }
    if (dauerSekunden > MAX_RIDE_SECONDS) {
      verworfeneTeile++;
      continue;
    }
    fahrten.push({
      name,
      punkte: ausduennen(teil, Math.min(IMPORT_ZIEL_PUNKTE, MAX_TRAIL_POINTS)),
      distanzKm: km,
      startMs: teil[0].t,
      dauerSekunden: Math.round(dauerSekunden),
    });
  }

  if (fahrten.length === 0) {
    return { fehler: "In der Datei ist keine Fahrt, die lang genug ist (mindestens 1 km)." };
  }
  return { fahrten, verworfeneTeile };
}
