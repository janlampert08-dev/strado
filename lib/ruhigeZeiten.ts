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

/**
 * Die Stufen sind relativ zur eigenen Woche der Strecke, nicht absolut.
 *
 * Bis 2026-09-23 galten feste Schwellen (≤ 1.05 ruhig, ≤ 1.15 normal,
 * ≤ 1.3 dicht). Sie scheiterten an den Daten selbst: der Faktor ist die
 * Fahrzeit geteilt durch die schnellste Stunde der Woche, und diese eine
 * Stunde ist oft ein Ausreisser. Am Furkapass lag sie am Samstag und Sonntag
 * um 7 Uhr (1.00), während Mapbox für Montag bis Freitag ein einziges,
 * durchgehend langsameres Profil liefert — die ruhigste Werktagsstunde war
 * 1.14. Mit festen Schwellen waren so 79 % der 98 Zellen "Dichter", Montag
 * 6 Uhr eingeschlossen, und am Grimsel 91 % "Dichter" oder "Zäh". Eine Karte,
 * auf der alles dicht ist, sagt nichts.
 *
 * Deshalb die Spannweite der Strecke selbst: das 10. und das 90. Perzentil
 * ihrer Faktoren sind unten und oben, dazwischen vier gleich breite Stufen.
 * Perzentile statt Minimum/Maximum, weil eine einzelne Ausreisserzelle — wie
 * die Wochenend-Morgenstunde am Furka — sonst wieder die ganze Skala
 * verschiebt. Gleich breite Stufen statt Quartile, weil Quartile auch in ein
 * Plateau Unterschiede hineinschneiden würden: an der Glaubenbielen liegt der
 * ganze Tag von 9 bis 19 Uhr knapp unter der Spitze, und das ist die Aussage
 * ("früh fahren"), nicht ein Fehler der Skala.
 *
 * Die Beschriftung sagt deshalb auch nicht "Stau", sondern wie voll es im
 * Vergleich zur übrigen Woche dieser Strecke ist.
 */
export const STUFEN_LABEL: Record<VerkehrsStufe, string> = {
  ruhig: "Ruhig",
  normal: "Mässig",
  dicht: "Belebt",
  zaeh: "Voll",
};

export const STUFEN_REIHENFOLGE: readonly VerkehrsStufe[] = ["ruhig", "normal", "dicht", "zaeh"];

export interface Skala {
  /** 10. Perzentil der Faktoren — bis hier ist es ruhig. */
  unten: number;
  /** 90. Perzentil — ab hier ist es voll. */
  oben: number;
  /** Die Woche unterscheidet sich kaum: dann gibt es keine Stufen. */
  flach: boolean;
}

/**
 * Unter acht Prozentpunkten Spannweite wäre eine Empfehlung aus Rauschen
 * gerechnet: gespeichert wird auf zwei Stellen, und gleiche Stunden an
 * verschiedenen Werktagen weichen um 0.01–0.03 ab. Dieselbe Grenze wie das
 * frühere "Maximum unter 1.08", jetzt auf die Spannweite bezogen statt auf den
 * Abstand zur einen schnellsten Stunde.
 */
export const FLACH_SPANNE = 0.08;

/** Perzentil mit linearer Interpolation, wie percentile_cont in Postgres. */
function perzentil(sortiert: number[], anteil: number): number {
  const position = (sortiert.length - 1) * anteil;
  const unten = Math.floor(position);
  const oben = Math.ceil(position);
  return sortiert[unten] + (sortiert[oben] - sortiert[unten]) * (position - unten);
}

export function skalaFuerPunkte(punkte: VerkehrsPunkt[]): Skala {
  if (punkte.length === 0) return { unten: 1, oben: 1, flach: true };
  const sortiert = punkte.map((p) => p.faktor).sort((a, b) => a - b);
  const unten = perzentil(sortiert, 0.1);
  const oben = perzentil(sortiert, 0.9);
  // Kleiner Zuschlag gegen Fliesskomma: 1.08 − 1.00 ist in Binär knapp unter 0.08.
  return { unten, oben, flach: oben - unten < FLACH_SPANNE - 1e-9 };
}

/**
 * Die Stufe einer Stunde innerhalb der Woche ihrer Strecke. Auf einer flachen
 * Strecke ist alles ruhig — das ist die Aussage, nicht ein Mangel.
 */
export function stufeFuerFaktor(faktor: number, skala: Skala): VerkehrsStufe {
  if (skala.flach) return "ruhig";
  const anteil = (faktor - skala.unten) / (skala.oben - skala.unten);
  if (anteil <= 0.25) return "ruhig";
  if (anteil <= 0.5) return "normal";
  if (anteil <= 0.75) return "dicht";
  return "zaeh";
}

export const WOCHENTAG_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const WOCHENTAG_LANG = [
  "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag",
] as const;

/**
 * Zwei Faktoren gelten als gleich, wenn sie höchstens so weit auseinander
 * liegen. Mapbox sagt Montag bis Freitag mit einem einzigen Profil voraus:
 * auf allen zwölf Strecken mit Daten (Stand 2026-09-23) wichen gleiche
 * Stunden an verschiedenen Werktagen um höchstens 0.03 ab, meist 0.01. Wer
 * daraus "Dienstag ist ruhiger als Mittwoch" liest, liest Rundung.
 */
export const GLEICH_TOLERANZ = 0.02;

/** "Mo–Fr", "Sa–So", "Mo, Mi", "täglich" — Tage so, wie man sie schreibt. */
export function tageText(tage: number[]): string {
  const sortiert = [...new Set(tage)].sort((a, b) => a - b);
  if (sortiert.length === 7) return "täglich";
  const laeufe: number[][] = [];
  for (const tag of sortiert) {
    const letzter = laeufe[laeufe.length - 1];
    if (letzter && letzter[letzter.length - 1] === tag - 1) letzter.push(tag);
    else laeufe.push([tag]);
  }
  return laeufe
    .map((lauf) =>
      lauf.length === 1
        ? WOCHENTAG_KURZ[lauf[0] - 1]
        : `${WOCHENTAG_KURZ[lauf[0] - 1]}–${WOCHENTAG_KURZ[lauf[lauf.length - 1] - 1]}`,
    )
    .join(", ");
}

/** "Montag bis Freitag", "Samstag und Sonntag" — für Vorlesesoftware. */
export function tageTextLang(tage: number[]): string {
  const sortiert = [...new Set(tage)].sort((a, b) => a - b);
  if (sortiert.length === 7) return "täglich";
  if (sortiert.length === 1) return WOCHENTAG_LANG[sortiert[0] - 1];
  const zusammenhaengend = sortiert.every((tag, i) => i === 0 || tag === sortiert[i - 1] + 1);
  if (zusammenhaengend && sortiert.length > 2) {
    return `${WOCHENTAG_LANG[sortiert[0] - 1]} bis ${WOCHENTAG_LANG[sortiert[sortiert.length - 1] - 1]}`;
  }
  const namen = sortiert.map((tag) => WOCHENTAG_LANG[tag - 1]);
  return `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

export interface HeatmapZeile {
  /** Erster Wochentag der Zeile (ISO, 1 = Montag). */
  wochentag: number;
  /** Alle Wochentage, die diese Zeile trägt — mehrere, wenn sie gleich sind. */
  tage: number[];
  werte: (number | null)[];
}

export interface Heatmap {
  /** Die Stunden, die tatsächlich Daten haben — aufsteigend. */
  stunden: number[];
  zeilen: HeatmapZeile[];
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
    tage: [i + 1],
    werte: stunden.map((stunde) => nachSchluessel.get(`${i + 1}:${stunde}`) ?? null),
  }));

  return { stunden, zeilen };
}

function zeilenGleich(a: (number | null)[], b: (number | null)[]): boolean {
  return a.every((wert, i) => {
    const anderer = b[i];
    if (wert === null || anderer === null) return wert === anderer;
    return Math.abs(wert - anderer) <= GLEICH_TOLERANZ + 1e-9;
  });
}

/**
 * Fasst aufeinanderfolgende Wochentage zusammen, deren Zeilen gleich sind —
 * in der Praxis Montag bis Freitag (siehe GLEICH_TOLERANZ). Fünf identische
 * Zeilen behaupten eine Auflösung, die die Vorhersage nicht hat; eine Zeile
 * "Mo–Fr" sagt, was sie weiss. Verglichen wird mit der ersten Zeile der
 * Gruppe, damit sich kleine Abweichungen nicht über die Woche aufsummieren.
 * Der Wert der Gruppe ist das Mittel.
 */
export function fasseGleicheTageZusammen(karte: Heatmap): Heatmap {
  const gruppen: HeatmapZeile[][] = [];
  for (const zeile of karte.zeilen) {
    const gruppe = gruppen[gruppen.length - 1];
    if (gruppe && zeilenGleich(gruppe[0].werte, zeile.werte)) gruppe.push(zeile);
    else gruppen.push([zeile]);
  }

  return {
    stunden: karte.stunden,
    zeilen: gruppen.map((gruppe) => ({
      wochentag: gruppe[0].wochentag,
      tage: gruppe.flatMap((z) => z.tage),
      werte: gruppe[0].werte.map((_, i) => {
        const vorhanden = gruppe.map((z) => z.werte[i]).filter((w): w is number => w !== null);
        if (vorhanden.length === 0) return null;
        return Math.round((vorhanden.reduce((a, b) => a + b, 0) / vorhanden.length) * 100) / 100;
      }),
    })),
  };
}

/**
 * Unterscheidet sich die Woche überhaupt? Auf einem abgelegenen Pass ist die
 * Antwort oft nein, und dann ist die ehrliche Aussage "kaum Unterschiede"
 * statt einer Empfehlung, die aus Rauschen gerechnet ist.
 */
export function istFlach(punkte: VerkehrsPunkt[]): boolean {
  return skalaFuerPunkte(punkte).flach;
}

export interface Fenster {
  /** Die Wochentage, an denen dieses Fenster gleich ruhig ist (ISO). */
  tage: number[];
  /** true = nur Samstag und/oder Sonntag. */
  wochenende: boolean;
  vonStunde: number;
  bisStunde: number;
  faktor: number;
}

export const WERKTAGE: readonly number[] = [1, 2, 3, 4, 5];

function mittel(werte: number[]): number {
  return werte.reduce((a, b) => a + b, 0) / werte.length;
}

const FENSTER_STUNDEN = 3;

/** Mittel des Fensters ab `start` an einem Tag — oder null bei einer Lücke. */
function fensterMittel(proStunde: Map<number, number>, start: number, laenge: number): number | null {
  const werte: number[] = [];
  for (let s = start; s < start + laenge; s++) {
    const wert = proStunde.get(s);
    if (wert === undefined) return null;
    werte.push(wert);
  }
  return mittel(werte);
}

/**
 * Das ruhigste zusammenhängende Zeitfenster der Woche — und alle Tage, an
 * denen dasselbe Fenster gleich ruhig ist.
 *
 * Gesucht wird je Tag, nicht über "werktags" gemittelt: so kann die Antwort
 * "Sa–So 6–9 Uhr" lauten, und weil Mapbox Montag bis Freitag gleich
 * vorhersagt, wird aus fünf gleichen Werktagen "Mo–Fr" statt eines
 * willkürlich herausgegriffenen Dienstags.
 *
 * `nurTage` beschränkt die Suche, etwa auf die Werktage für die zweite Zeile
 * "unter der Woche", wenn das Wochenende gewinnt.
 */
export function ruhigstesFenster(
  punkte: VerkehrsPunkt[],
  nurTage?: readonly number[],
): Fenster | null {
  const auswahl = nurTage ? punkte.filter((p) => nurTage.includes(p.wochentag)) : punkte;
  if (auswahl.length === 0) return null;

  const jeTag = new Map<number, Map<number, number>>();
  for (const punkt of auswahl) {
    const tag = jeTag.get(punkt.wochentag) ?? new Map<number, number>();
    tag.set(punkt.stunde, punkt.faktor);
    jeTag.set(punkt.wochentag, tag);
  }
  const tageSortiert = [...jeTag.keys()].sort((a, b) => a - b);

  // Erst drei zusammenhängende Stunden; nur wenn es die nirgends gibt, gilt
  // die ruhigste einzelne Stunde. 7, 8, 9 ist eine Empfehlung, 7, 11, 15 nicht.
  for (const laenge of [FENSTER_STUNDEN, 1]) {
    let bestes: { start: number; faktor: number } | null = null;
    for (const tag of tageSortiert) {
      const proStunde = jeTag.get(tag)!;
      for (const start of [...proStunde.keys()].sort((a, b) => a - b)) {
        const faktor = fensterMittel(proStunde, start, laenge);
        if (faktor === null) continue;
        if (!bestes || faktor < bestes.faktor - 1e-9) bestes = { start, faktor };
      }
    }
    if (!bestes) continue;

    const { start, faktor } = bestes;
    const tage = tageSortiert.filter((tag) => {
      const wert = fensterMittel(jeTag.get(tag)!, start, laenge);
      return wert !== null && wert <= faktor + GLEICH_TOLERANZ + 1e-9;
    });

    return {
      tage,
      wochenende: tage.every((t) => t >= 6),
      vonStunde: start,
      bisStunde: start + laenge,
      faktor,
    };
  }

  return null;
}

export interface Spitze {
  tage: number[];
  stunde: number;
  faktor: number;
}

/**
 * Die vollste Stunde der Woche — die Gegenprobe zur Empfehlung — samt allen
 * Tagen, an denen dieselbe Stunde gleich voll ist.
 */
export function vollsteZeit(punkte: VerkehrsPunkt[]): Spitze | null {
  if (punkte.length === 0) return null;
  const spitze = punkte.reduce((a, b) => (b.faktor > a.faktor ? b : a));
  const tage = punkte
    .filter((p) => p.stunde === spitze.stunde && p.faktor >= spitze.faktor - GLEICH_TOLERANZ - 1e-9)
    .map((p) => p.wochentag);
  return { tage: [...new Set(tage)].sort((a, b) => a - b), stunde: spitze.stunde, faktor: spitze.faktor };
}

/** "Sa–So 6–9 Uhr", "Mo–Fr 7–10 Uhr". */
export function fensterText(fenster: Fenster): string {
  return `${tageText(fenster.tage)} ${fenster.vonStunde}–${fenster.bisStunde} Uhr`;
}

/** "Mo–Fr um 13 Uhr". */
export function spitzeText(spitze: Spitze): string {
  return `${tageText(spitze.tage)} um ${spitze.stunde} Uhr`;
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
