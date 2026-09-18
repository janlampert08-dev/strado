// Der Passkalender: übliche Saison, geplante Sperrungen, tatsächliche
// Öffnungen der vergangenen Jahre.
//
// Rein und ohne Datenbank — die Abfragen stehen in lib/paesse.ts. Alles hier
// rechnet in Schweizer Ortszeit, weil ein Kalender ein lokaler Kalender ist:
// eine Sperrung am 7. Juni ist am 7. Juni, nicht um 22 Uhr UTC am 6.

export const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
] as const;

export const MONATSKUERZEL = [
  "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D",
] as const;

/**
 * "Wintersperre üblich von Oktober bis Mai" — oder null für einen Pass, der
 * ganzjährig offen ist.
 *
 * "Üblich" ist nicht Beiwerk: die Monate stammen aus Erfahrungswerten
 * (0104), nicht aus einer Zusage. Was heute gilt, sagt allein der Status.
 */
export function wintersperreText(ab: number | null, bis: number | null): string | null {
  if (ab === null || bis === null) return null;
  return `Wintersperre üblich von ${MONATSNAMEN[ab - 1]} bis ${MONATSNAMEN[bis - 1]}`;
}

/**
 * Für das Saisonband: je Monat, ob der Pass dann üblicherweise befahrbar ist.
 * Ein Pass ohne Wintersperre ist es in allen zwölf.
 */
export function saisonMonate(ab: number | null, bis: number | null): boolean[] {
  if (ab === null || bis === null) return Array.from({ length: 12 }, () => true);

  return Array.from({ length: 12 }, (_, i) => {
    const monat = i + 1;
    // Gesperrt von "ab" bis "bis", über den Jahreswechsel hinweg.
    const gesperrt = ab <= bis ? monat >= ab && monat <= bis : monat >= ab || monat <= bis;
    return !gesperrt;
  });
}

export type SperrtagArt = "autofrei" | "veranstaltung" | "bauarbeiten" | "sonstiges";

export const ART_LABEL: Record<SperrtagArt, string> = {
  autofrei: "Autofrei",
  veranstaltung: "Veranstaltung",
  bauarbeiten: "Bauarbeiten",
  sonstiges: "Sperrung",
};

export interface Sperrtag {
  id: string;
  passId: string;
  von: string;
  bis: string;
  art: SperrtagArt;
  titel: string;
  zeitfenster: string | null;
  quelleUrl: string | null;
}

/** Datum als YYYY-MM-DD in Schweizer Ortszeit. */
export function heuteCH(jetzt: Date = new Date()): string {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(jetzt);
  const wert = (art: string) => teile.find((t) => t.type === art)?.value;
  return `${wert("year")}-${wert("month")}-${wert("day")}`;
}

/**
 * Kommende und vergangene Sperrungen, beide in der Reihenfolge, in der man sie
 * liest: die nächste zuerst, die letzte vergangene zuerst.
 *
 * Ein Zeitraum, der heute läuft, gehört zu den kommenden — er steht noch
 * bevor, jedenfalls für den Rest des Tages.
 */
export function teileSperrtage(
  sperrtage: Sperrtag[],
  heute: string,
): { kommend: Sperrtag[]; vergangen: Sperrtag[] } {
  const kommend = sperrtage
    .filter((s) => s.bis >= heute)
    .sort((a, b) => a.von.localeCompare(b.von));
  const vergangen = sperrtage
    .filter((s) => s.bis < heute)
    .sort((a, b) => b.von.localeCompare(a.von));
  return { kommend, vergangen };
}

function tagUndMonat(datum: string): { tag: number; monat: number; jahr: number } | null {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (!treffer) return null;
  return { jahr: Number(treffer[1]), monat: Number(treffer[2]), tag: Number(treffer[3]) };
}

/**
 * "7. Juni 2026", "7.–9. Juni 2026", "29. Juni bis 2. Juli 2026".
 *
 * Aus der Zeichenkette gerechnet statt über Date: ein "2026-06-07" durch
 * new Date() ist Mitternacht UTC und damit in der Schweiz je nach Monat schon
 * der Vortag — derselbe Fehler, den lib/fahrtstatistik.ts im Kopf beschreibt.
 */
export function formatiereZeitraum(von: string, bis: string): string {
  const a = tagUndMonat(von);
  const b = tagUndMonat(bis);
  if (!a || !b) return von;

  if (von === bis) return `${a.tag}. ${MONATSNAMEN[a.monat - 1]} ${a.jahr}`;
  if (a.jahr === b.jahr && a.monat === b.monat) {
    return `${a.tag}.–${b.tag}. ${MONATSNAMEN[a.monat - 1]} ${a.jahr}`;
  }
  if (a.jahr === b.jahr) {
    return `${a.tag}. ${MONATSNAMEN[a.monat - 1]} bis ${b.tag}. ${MONATSNAMEN[b.monat - 1]} ${a.jahr}`;
  }
  return `${a.tag}. ${MONATSNAMEN[a.monat - 1]} ${a.jahr} bis ${b.tag}. ${MONATSNAMEN[b.monat - 1]} ${b.jahr}`;
}

export interface PassEreignis {
  zustand: "offen" | "eingeschraenkt" | "gesperrt" | "wintersperre";
  vorher: "offen" | "eingeschraenkt" | "gesperrt" | "wintersperre" | null;
  erfasstAm: string;
}

export interface Oeffnung {
  jahr: number;
  /** ISO-Datum des Tages, an dem der Pass wieder offen gemeldet wurde. */
  datum: string;
}

/**
 * Die tatsächlichen Öffnungstage je Jahr, aus dem Ereignisprotokoll.
 *
 * Das ist der Teil des Kalenders, der mit der Zeit wertvoller wird: die
 * üblichen Monate stehen fest im Katalog, aber "2026 ging der Susten am
 * 28. Mai auf" kann nur sagen, wer dabei zugesehen hat. Im ersten Jahr ist
 * diese Liste leer, und die App zeigt sie dann auch nicht.
 *
 * Je Jahr zählt die erste Öffnung nach einer Wintersperre; eine kurzfristige
 * Sperrung mitten im Sommer erzeugt keinen zweiten Eintrag.
 */
export function oeffnungenAusEreignissen(ereignisse: PassEreignis[]): Oeffnung[] {
  const proJahr = new Map<number, string>();

  for (const ereignis of ereignisse) {
    if (ereignis.zustand !== "offen" || ereignis.vorher !== "wintersperre") continue;
    const datum = new Date(ereignis.erfasstAm);
    if (Number.isNaN(datum.getTime())) continue;
    const iso = heuteCH(datum);
    const jahr = Number(iso.slice(0, 4));
    const vorhandenes = proJahr.get(jahr);
    if (!vorhandenes || iso < vorhandenes) proJahr.set(jahr, iso);
  }

  return [...proJahr.entries()]
    .map(([jahr, datum]) => ({ jahr, datum }))
    .sort((a, b) => b.jahr - a.jahr);
}

/** "Offen seit dem 28. Mai 2026" — nur wenn der aktuelle Zustand offen ist
 *  und wir den Wechsel selbst gesehen haben. */
export function offenSeitText(
  zustand: string,
  seit: string | null,
  ereignisse: PassEreignis[],
): string | null {
  if (zustand !== "offen" || !seit) return null;
  const letzteOeffnung = ereignisse.find((e) => e.zustand === "offen" && e.vorher === "wintersperre");
  if (!letzteOeffnung) return null;

  const iso = heuteCH(new Date(letzteOeffnung.erfasstAm));
  const teile = tagUndMonat(iso);
  if (!teile) return null;
  return `Offen seit dem ${teile.tag}. ${MONATSNAMEN[teile.monat - 1]} ${teile.jahr}`;
}
