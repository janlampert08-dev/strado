// Die reinen Teile der Seite eines einzelnen Passes (app/paesse/[id]):
// Kantonsnamen, Scheitelpunkt, Nachbarpässe, Artikel und die Fragen, die
// die Seite beantwortet.
//
// Ohne Datenbank und ohne Server-Import, damit alles hier prüfbar bleibt
// (lib/passSeite.test.ts). Die Abfragen stehen in lib/paesse.ts.
import { haversineKm } from "@/lib/geo";
import { wintersperreText } from "@/lib/passKalender";
import type { PassStatusAnzeige } from "@/lib/passStatus";

/** Dasselbe Muster wie der CHECK auf paesse.id (0104) und die Server
 *  Actions (lib/actions/paesse.ts). Eine Adresse, die ihm nicht folgt, kann
 *  kein Pass sein — dafür braucht es keine Abfrage. */
const PASS_ID_MUSTER = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function istPassId(wert: unknown): wert is string {
  return typeof wert === "string" && wert.length <= 60 && PASS_ID_MUSTER.test(wert);
}

/**
 * Die Kantone ausgeschrieben. Der Katalog führt nur die Kürzel (0104); in
 * der Liste genügen die, auf der Seite eines Passes aber sucht jemand nach
 * "Klausenpass Uri", nicht nach "UR".
 */
export const KANTON_NAMEN: Record<string, string> = {
  AG: "Aargau",
  AI: "Appenzell Innerrhoden",
  AR: "Appenzell Ausserrhoden",
  BE: "Bern",
  BL: "Basel-Landschaft",
  BS: "Basel-Stadt",
  FR: "Freiburg",
  GE: "Genf",
  GL: "Glarus",
  GR: "Graubünden",
  JU: "Jura",
  LU: "Luzern",
  NE: "Neuenburg",
  NW: "Nidwalden",
  OW: "Obwalden",
  SG: "St. Gallen",
  SH: "Schaffhausen",
  SO: "Solothurn",
  SZ: "Schwyz",
  TG: "Thurgau",
  TI: "Tessin",
  UR: "Uri",
  VD: "Waadt",
  VS: "Wallis",
  ZG: "Zug",
  ZH: "Zürich",
};

/** "Kanton Graubünden", "Kantone Uri und Glarus", "Kantone Bern, Wallis und
 *  Uri". Ein unbekanntes Kürzel bleibt als Kürzel stehen, statt zu fehlen. */
export function kantoneText(kuerzel: string[]): string {
  const namen = kuerzel.map((k) => KANTON_NAMEN[k] ?? k);
  if (namen.length === 0) return "";
  if (namen.length === 1) return `Kanton ${namen[0]}`;
  return `Kantone ${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

/** "im Kanton Graubünden", "in den Kantonen Uri und Glarus" — für Sätze. */
export function imKanton(kuerzel: string[]): string {
  const text = kantoneText(kuerzel);
  if (!text) return "";
  return kuerzel.length === 1 ? `im ${text}` : `in den ${text.replace(/^Kantone /, "Kantonen ")}`;
}

/**
 * Der Scheitelpunkt aus der Antwort von PostgREST.
 *
 * `paesse.scheitel` ist `geography(Point, 4326)`, und PostgREST liefert eine
 * solche Spalte als Hex-EWKB aus ("0101000020E6100000…"), nicht als GeoJSON.
 * Für einen Punkt ist das Format fest: Byte-Reihenfolge, Typ mit SRID-Flag,
 * SRID, dann zwei Doubles (Länge, Breite). Das hier zu lesen ist billiger
 * als eine View oder Funktion nur dafür — und die Seite soll ohne Migration
 * auskommen.
 *
 * Gibt null zurück für alles, was kein Punkt ist; die Nachbarschaft fällt
 * dann für diesen Pass weg, die Seite bleibt stehen.
 */
export function punktAusEwkb(hex: unknown): [number, number] | null {
  if (typeof hex !== "string" || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const ansicht = new DataView(bytes.buffer);
  if (bytes.length < 21) return null;

  const littleEndian = bytes[0] === 1;
  const typ = ansicht.getUint32(1, littleEndian);
  const hatSrid = (typ & 0x20000000) !== 0;
  // Nur der 2D-Punkt: Z/M-Flags oder ein anderer Grundtyp sind hier ein
  // Formatfehler, kein Fall, den die Seite deuten müsste.
  if ((typ & 0x0fffffff) !== 1 || (typ & 0xc0000000) !== 0) return null;

  const start = hatSrid ? 9 : 5;
  if (bytes.length < start + 16) return null;
  const lng = ansicht.getFloat64(start, littleEndian);
  const lat = ansicht.getFloat64(start + 8, littleEndian);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

export interface PassOrt {
  id: string;
  kantone: string[];
  scheitel: [number, number] | null;
}

/**
 * Die Nachbarn eines Passes: nach Luftlinie zwischen den Scheitelpunkten,
 * die nächsten zuerst. Ohne Scheitel (Formatfehler) gilt stattdessen der
 * gemeinsame Kanton — dann ohne Distanz, weil es keine gibt.
 */
export function naechstePaesse<T extends PassOrt>(
  bezug: PassOrt,
  alle: T[],
  anzahl = 4,
): { pass: T; distanzKm: number | null }[] {
  const andere = alle.filter((p) => p.id !== bezug.id);

  if (!bezug.scheitel) {
    return andere
      .filter((p) => p.kantone.some((k) => bezug.kantone.includes(k)))
      .slice(0, anzahl)
      .map((pass) => ({ pass, distanzKm: null }));
  }

  const von = bezug.scheitel;
  return andere
    .filter((p): p is T & { scheitel: [number, number] } => p.scheitel !== null)
    .map((pass) => ({ pass: pass as T, distanzKm: haversineKm(von, pass.scheitel) }))
    .sort((a, b) => a.distanzKm - b.distanzKm)
    .slice(0, anzahl);
}

// Die Pässe im Katalog, die weiblich sind ("die Ibergeregg"). Alle übrigen
// sind "der …pass" oder "der Col …". Eine Liste statt einer Regel: im
// Katalog stehen 34 Namen, und keine Endung sagt das Geschlecht verlässlich.
const WEIBLICH = new Set(["forcola-di-livigno", "glaubenbielen", "ibergeregg", "vue-des-alpes", "sattelegg"]);

/** "der Sustenpass" / "die Ibergeregg". */
export function mitArtikel(id: string, name: string): string {
  return `${WEIBLICH.has(id) ? "die" : "der"} ${name}`;
}

/** "am Sustenpass" / "an der Ibergeregg". */
export function amPass(id: string, name: string): string {
  return `${WEIBLICH.has(id) ? "an der" : "am"} ${name}`;
}

/** "über den Sustenpass" / "über die Ibergeregg". */
export function ueberPass(id: string, name: string): string {
  return `über ${WEIBLICH.has(id) ? "die" : "den"} ${name}`;
}

function grossAnfang(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Die Beschreibung für Suchmaschine und Linkvorschau. Ohne Status: der
 *  gecachte Stand eines Suchergebnisses wäre eine Behauptung von gestern. */
export function passBeschreibung(pass: {
  id: string;
  name: string;
  hoeheM: number;
  kantone: string[];
  wintersperreAbMonat: number | null;
  wintersperreBisMonat: number | null;
}): string {
  const sperre = wintersperreText(pass.wintersperreAbMonat, pass.wintersperreBisMonat);
  const teile = [
    `${grossAnfang(mitArtikel(pass.id, pass.name))} liegt auf ${pass.hoeheM.toLocaleString("de-CH")} m ü. M. (${kantoneText(pass.kantone)}).`,
    sperre ? `${sperre}.` : "Ohne übliche Wintersperre.",
    "Aktueller Passstatus aus den ASTRA-Verkehrsmeldungen, geplante Sperrungen und die Strecke darüber.",
  ];
  return teile.join(" ");
}

export interface PassFrage {
  frage: string;
  antwort: string;
}

/**
 * Die Fragen, mit denen jemand auf dieser Seite landet — und nur mit
 * Antworten aus den Daten, die die Seite ohnehin zeigt. Keine Antwort
 * behauptet mehr als der Status: "kein Stand" bleibt "kein Stand", auch wenn
 * "offen" die freundlichere Auskunft wäre.
 */
export function passFragen({
  pass,
  anzeige,
  strecke,
}: {
  pass: {
    id: string;
    name: string;
    hoeheM: number;
    kantone: string[];
    wintersperreAbMonat: number | null;
    wintersperreBisMonat: number | null;
  };
  anzeige: PassStatusAnzeige;
  strecke: { name: string; laengeKm: number } | null;
}): PassFrage[] {
  const derPass = mitArtikel(pass.id, pass.name);

  const statusAntwort =
    anzeige.zustand === "unbekannt"
      ? `Dazu gibt es gerade keine verlässliche Meldung (${anzeige.herkunft}). ${anzeige.text}`
      : `Stand jetzt: ${anzeige.label}. ${anzeige.text} Quelle: ${anzeige.herkunft}.`;

  const sperre = wintersperreText(pass.wintersperreAbMonat, pass.wintersperreBisMonat);
  const sperreAntwort = sperre
    ? `${sperre}. Die Monate sind Erfahrungswerte; wann ${derPass} in diesem Jahr tatsächlich schliesst oder öffnet, zeigt der Status oben.`
    : `${grossAnfang(derPass)} hat keine übliche Wintersperre. Einzelne Sperrungen, etwa bei Schnee, zeigt der Status oben.`;

  const fragen: PassFrage[] = [
    { frage: `Ist ${derPass} offen?`, antwort: statusAntwort },
    { frage: `Wann ist die Wintersperre ${amPass(pass.id, pass.name)}?`, antwort: sperreAntwort },
    {
      frage: `Wie hoch ist ${derPass}?`,
      antwort: `Die Passhöhe liegt auf ${pass.hoeheM.toLocaleString("de-CH")} m ü. M., ${imKanton(pass.kantone)}.`,
    },
  ];

  if (strecke) {
    fragen.push({
      frage: `Welche Strecke führt ${ueberPass(pass.id, pass.name)}?`,
      antwort: `Auf Strado: „${strecke.name}", ${strecke.laengeKm.toLocaleString("de-CH", { maximumFractionDigits: 1 })} km.`,
    });
  }

  return fragen;
}
