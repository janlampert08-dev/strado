// Die volle Streckenlinie ausserhalb der Seitennutzlast.
//
// Bis 2026-09-23 trug die Streckenseite die exakte Geometrie in der
// RSC-Nutzlast mit — dazu die volle Geometrie jeder umliegenden Strecke für
// die Aufzeichnungskarte. Auf dem Albulapass waren das 9 964 Koordinatenpaare
// und 313 KB Framework-Daten, bei jedem Aufruf, auch für Besucher, die die
// Karte nie anschauen. Jetzt:
//
//   - die Seite schickt die vereinfachte Übersichtslinie (0117) für den
//     ersten Aufbau mit, dazu eine versionierte Adresse;
//   - der Browser holt die volle Linie dort als Encoded Polyline
//     (lib/polyline.ts) — lang cachebar, weil die Version in der Adresse
//     steht und sich mit jeder Änderung der Geometrie ändert.
//
// Dieses Modul ist rein und ohne Server-Import: die Seite (Server) baut damit
// Adresse und Version, die Client-Komponenten (components/VolleGeometrie.tsx)
// laden und prüfen damit die Antwort.

import { decodePolyline, encodePolyline } from "@/lib/polyline";
import type { GeoLineString } from "@/types/database";

// cyrb53 (gemeinfrei, bryc) — ein schneller 53-Bit-Hash. Kein
// Sicherheitsmerkmal: die Version ist nur Cache-Schlüssel. Eine Kollision
// hiesse, dass eine geänderte Linie derselben Strecke unter der alten
// Adresse gecacht bliebe — bei 2^53 Möglichkeiten pro Strecke vernachlässigbar.
// Bewusst nicht node:crypto, damit das Modul auch im Browser lädt.
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Version einer kodierten Linie — gleiche Linie, gleiche Version. */
export function geometrieVersion(polyline: string): string {
  return cyrb53(polyline).toString(36);
}

/** Kodierte Linie plus Version, aus der exakten Geometrie. */
export function kodiereGeometrie(geometrie: GeoLineString): { v: string; p: string } {
  const p = encodePolyline(geometrie.coordinates);
  return { v: geometrieVersion(p), p };
}

export function geometrieUrl(streckenId: string, version: string): string {
  return `/strecken/${encodeURIComponent(streckenId)}/geometrie?v=${encodeURIComponent(version)}`;
}

/**
 * Die Strecke mit der Übersichtslinie statt der exakten Geometrie — für die
 * Seitennutzlast. getRoute() liest select("*") aus routes_geojson und bekommt
 * seit 0117 die Spalte geometry_uebersicht_geojson mit; die fällt hier weg,
 * damit nicht beide Linien in der Nutzlast stehen. Fehlt die Übersicht (Spalte
 * nicht da oder null), bleibt die exakte Linie — der Stand vor dieser
 * Änderung, nur ohne Ersparnis.
 */
export function mitUebersichtsgeometrie<T extends { geometry_geojson: GeoLineString }>(
  strecke: T & { geometry_uebersicht_geojson?: GeoLineString | null },
): T {
  const { geometry_uebersicht_geojson: uebersicht, ...rest } = strecke;
  const brauchbar =
    uebersicht && Array.isArray(uebersicht.coordinates) && uebersicht.coordinates.length >= 2;
  return { ...(rest as unknown as T), geometry_geojson: brauchbar ? uebersicht : strecke.geometry_geojson };
}

/**
 * Prüft und dekodiert die Antwort des Endpunkts. null bei allem, was nicht
 * eine Linie mit mindestens zwei gültigen Punkten ergibt — der Aufrufer
 * bleibt dann bei der Übersichtslinie.
 */
export function leseGeometrieAntwort(json: unknown): [number, number][] | null {
  if (!json || typeof json !== "object") return null;
  const p = (json as { p?: unknown }).p;
  if (typeof p !== "string" || p.length === 0) return null;
  let punkte: [number, number][];
  try {
    punkte = decodePolyline(p);
  } catch {
    return null;
  }
  if (punkte.length < 2) return null;
  const gueltig = punkte.every(
    ([lng, lat]) =>
      Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90,
  );
  return gueltig ? punkte : null;
}

export const CACHE_OEFFENTLICH = "public, max-age=31536000, immutable";
export const CACHE_PRIVAT = "private, no-store";

/**
 * Cache-Control für den Endpunkt app/strecken/[id]/geometrie. Lange und
 * geteilt cachebar ist die Antwort nur, wenn beides gilt: die Strecke ist
 * freigegeben und öffentlich (dann ist die Antwort für jede Sitzung
 * dieselbe), und die angefragte Version ist die der ausgelieferten Linie
 * (sonst stünde unter der Adresse dauerhaft ein anderer Inhalt).
 */
export function geometrieCacheControl(strecke: {
  status_ok: boolean;
  ist_privat: boolean;
  angefragteVersion: string | null;
  version: string;
}): string {
  const oeffentlich = strecke.status_ok === true && strecke.ist_privat === false;
  return oeffentlich && strecke.angefragteVersion === strecke.version
    ? CACHE_OEFFENTLICH
    : CACHE_PRIVAT;
}

type Abruf = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Lädt volle Linien, je Adresse höchstens einmal gleichzeitig: Karte,
 * Aufzeichnung, GPX-Export und Offline-Knopf fragen auf derselben Seite
 * dieselbe Adresse an und teilen sich einen Abruf. Ein Fehlschlag wird nicht
 * gemerkt — der nächste Aufrufer versucht es neu (etwa der Offline-Knopf,
 * nachdem der Empfang zurück ist).
 */
export function erzeugeGeometrieLader(abruf: Abruf) {
  const laufend = new Map<string, Promise<[number, number][]>>();
  const fertig = new Map<string, [number, number][]>();

  function laden(url: string): Promise<[number, number][]> {
    const vorhanden = fertig.get(url);
    if (vorhanden) return Promise.resolve(vorhanden);
    const offen = laufend.get(url);
    if (offen) return offen;
    const versuch = (async () => {
      const antwort = await abruf(url);
      if (!antwort.ok) throw new Error("Geometrie nicht verfügbar");
      const punkte = leseGeometrieAntwort(await antwort.json());
      if (!punkte) throw new Error("Geometrie unlesbar");
      fertig.set(url, punkte);
      return punkte;
    })().finally(() => laufend.delete(url));
    laufend.set(url, versuch);
    return versuch;
  }

  /** Schon geladene Linie, synchron — für den ersten Render nach einem Abruf. */
  function bekannt(url: string): [number, number][] | null {
    return fertig.get(url) ?? null;
  }

  return { laden, bekannt };
}
