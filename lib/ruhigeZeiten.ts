// Wann ist auf einer Strecke wenig los?
//
// Zwei Quellen, zwei Aussagen (siehe 0105):
//   * strecken_verkehr — Faktoren aus der Verkehrsvorhersage von Mapbox:
//     1.00 ist die ruhigste Stunde der Woche, 1.30 heisst "dauert 30 % länger".
//   * strecken_startzeiten() — wann auf Strado tatsächlich losgefahren wird.
//
// Die zweite ist nicht dasselbe wie die erste und wird deshalb auch nicht
// zusammengerechnet: viel Verkehr ist etwas anderes als viele Strado-Fahrer.
// Die Seite zeigt beides getrennt und beschriftet, welche Zahl woher kommt.

export type VerkehrsStufe = "ruhig" | "normal" | "dicht" | "zaeh";

export interface VerkehrsPunkt {
  /** ISO-Wochentag, 1 = Montag. */
  wochentag: number;
  stunde: number;
  faktor: number;
}

export const STUFEN_LABEL: Record<VerkehrsStufe, string> = {
  ruhig: "Ruhig",
  normal: "Normal",
  dicht: "Dichter",
  zaeh: "Zäh",
};

/**
 * Die Schwellen sind bewusst eng: auf einer Passstrasse bedeutet schon ein
 * Fünftel mehr Fahrzeit, dass man hinter jemandem hängt. Wer "zäh" liest,
 * soll nicht an Stau denken, sondern an Wohnmobile.
 */
export function stufeFuerFaktor(faktor: number): VerkehrsStufe {
  if (faktor <= 1.05) return "ruhig";
  if (faktor <= 1.15) return "normal";
  if (faktor <= 1.3) return "dicht";
  return "zaeh";
}

export const WOCHENTAG_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const WOCHENTAG_LANG = [
  "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag",
] as const;

export interface Heatmap {
  /** Die Stunden, die tatsächlich Daten haben — aufsteigend. */
  stunden: number[];
  zeilen: { wochentag: number; werte: (number | null)[] }[];
}

/**
 * Bringt die Punkte in die Form, die das Raster zeichnet: sieben Zeilen,
 * eine Spalte je vorhandener Stunde, null für Lücken.
 *
 * Lücken sind der Normalfall und kein Fehler: das Profil deckt die Stunden ab,
 * zu denen jemand fährt (siehe PROFIL_STUNDEN in lib/verkehrsprofil.ts), und
 * ein einzelner fehlgeschlagener Abruf lässt eine Zelle leer.
 */
export function baueHeatmap(punkte: VerkehrsPunkt[]): Heatmap | null {
  if (punkte.length === 0) return null;

  const stunden = [...new Set(punkte.map((p) => p.stunde))].sort((a, b) => a - b);
  const nachSchluessel = new Map(punkte.map((p) => [`${p.wochentag}:${p.stunde}`, p.faktor]));

  const zeilen = Array.from({ length: 7 }, (_, i) => ({
    wochentag: i + 1,
    werte: stunden.map((stunde) => nachSchluessel.get(`${i + 1}:${stunde}`) ?? null),
  }));

  return { stunden, zeilen };
}

/**
 * Unterscheidet sich die Woche überhaupt? Auf einem abgelegenen Pass ist die
 * Antwort oft nein, und dann ist die ehrliche Aussage "kaum Unterschiede"
 * statt einer Empfehlung, die aus Rauschen gerechnet ist.
 */
export function istFlach(punkte: VerkehrsPunkt[]): boolean {
  if (punkte.length === 0) return true;
  return Math.max(...punkte.map((p) => p.faktor)) < 1.08;
}

export interface Fenster {
  /** true = Samstag/Sonntag, false = Montag bis Freitag. */
  wochenende: boolean;
  vonStunde: number;
  bisStunde: number;
  faktor: number;
}

function mittel(werte: number[]): number {
  return werte.reduce((a, b) => a + b, 0) / werte.length;
}

const FENSTER_STUNDEN = 3;

function fensterFuerGruppe(punkte: VerkehrsPunkt[], wochenende: boolean): Fenster | null {
  const gruppe = punkte.filter((p) => (p.wochentag >= 6) === wochenende);
  if (gruppe.length === 0) return null;

  const proStunde = new Map<number, number[]>();
  for (const punkt of gruppe) {
    const bisher = proStunde.get(punkt.stunde) ?? [];
    bisher.push(punkt.faktor);
    proStunde.set(punkt.stunde, bisher);
  }

  const stunden = [...proStunde.keys()].sort((a, b) => a - b);
  let bestes: Fenster | null = null;

  for (const start of stunden) {
    // Nur zusammenhängende Fenster: 7,8,9 ist eine Empfehlung, 7,11,15 nicht.
    const folge = Array.from({ length: FENSTER_STUNDEN }, (_, i) => start + i);
    if (!folge.every((s) => proStunde.has(s))) continue;
    const faktor = mittel(folge.flatMap((s) => proStunde.get(s) ?? []));
    if (!bestes || faktor < bestes.faktor) {
      bestes = { wochenende, vonStunde: start, bisStunde: start + FENSTER_STUNDEN, faktor };
    }
  }

  // Zu wenige Stunden für ein Fenster: dann gilt die ruhigste einzelne Stunde.
  if (!bestes && stunden.length > 0) {
    const beste = stunden.reduce((a, b) =>
      mittel(proStunde.get(b) ?? []) < mittel(proStunde.get(a) ?? []) ? b : a,
    );
    bestes = {
      wochenende,
      vonStunde: beste,
      bisStunde: beste + 1,
      faktor: mittel(proStunde.get(beste) ?? []),
    };
  }

  return bestes;
}

/** Das ruhigste zusammenhängende Zeitfenster der Woche. */
export function ruhigstesFenster(punkte: VerkehrsPunkt[]): Fenster | null {
  const werktags = fensterFuerGruppe(punkte, false);
  const wochenende = fensterFuerGruppe(punkte, true);
  if (!werktags) return wochenende;
  if (!wochenende) return werktags;
  return wochenende.faktor < werktags.faktor ? wochenende : werktags;
}

/** Die vollste Stunde der Woche — die Gegenprobe zur Empfehlung. */
export function vollsteStunde(punkte: VerkehrsPunkt[]): VerkehrsPunkt | null {
  if (punkte.length === 0) return null;
  return punkte.reduce((a, b) => (b.faktor > a.faktor ? b : a));
}

export function fensterText(fenster: Fenster): string {
  const wann = fenster.wochenende ? "am Wochenende" : "werktags";
  return `${wann} zwischen ${fenster.vonStunde} und ${fenster.bisStunde} Uhr`;
}

export type Tageszeit = "morgen" | "mittag" | "nachmittag" | "abend";

export const TAGESZEIT_LABEL: Record<Tageszeit, string> = {
  morgen: "Morgen",
  mittag: "Mittag",
  nachmittag: "Nachmittag",
  abend: "Abend",
};

/** "am Sonntagmorgen", "am Dienstagabend" — ein Wort, wie man es sagt. */
export function tageszeitAmTag(wochentag: number, tageszeit: Tageszeit): string | null {
  const tag = WOCHENTAG_LANG[wochentag - 1];
  if (!tag) return null;
  return `am ${tag}${TAGESZEIT_LABEL[tageszeit].toLowerCase()}`;
}

export interface Startzeit {
  wochentag: number;
  tageszeit: Tageszeit;
  anteil: number;
}

/**
 * "Auf Strado wird am häufigsten am Sonntagmorgen gestartet."
 *
 * Nur ein Satz, kein zweites Raster: die Datenbank gibt diese Zahlen erst ab
 * zwanzig Starts heraus (0105), und zwanzig Starts tragen einen Satz, aber
 * keine Wochenkarte.
 */
export function startzeitenSatz(startzeiten: Startzeit[]): string | null {
  if (startzeiten.length === 0) return null;
  const beste = startzeiten.reduce((a, b) => (b.anteil > a.anteil ? b : a));
  if (beste.anteil < 20) return null;

  const wann = tageszeitAmTag(beste.wochentag, beste.tageszeit);
  if (!wann) return null;
  return `Auf Strado wird am häufigsten ${wann} gestartet.`;
}
