// Passstatus (für alle) und Pass-Alarm (Premium) — die reine Logik.
//
// Diese Datei importiert nichts Serverseitiges: die Moderationsform und der
// Alarm-Schalter sind Client Components und brauchen dieselben Werte,
// Beschriftungen und Grenzen wie die Server Action. Abfragen stehen in
// lib/passStatusAbfragen.ts (Muster wie lib/aktivitaet.ts /
// lib/aktivitaetsliste.ts).
//
// Die Datenbank ist die Schranke (0112_pass_status_und_alarm.sql: CHECKs,
// RLS). Was hier geprüft wird, ist die freundliche Fehlermeldung davor —
// und die Anzeige, die in einer .tsx ungetestet bliebe.

export const PASS_STATUS_WERTE = ["offen", "gesperrt", "wintersperre"] as const;
export type PassStatusWert = (typeof PASS_STATUS_WERTE)[number];

export const PASS_STATUS_LABEL: Record<PassStatusWert, string> = {
  offen: "Offen",
  gesperrt: "Gesperrt",
  wintersperre: "Wintersperre",
};

/** Dieselben Grenzen wie die CHECK-Constraints in 0112. */
export const PASS_HINWEIS_MAX = 200;
export const PASS_QUELLE_MAX = 60;

/**
 * Ab wie vielen Tagen eine Prüfung als veraltet gilt. Eine Woche, weil ein
 * Pass im Frühsommer innert Tagen öffnet und im Herbst über Nacht schliesst
 * — eine Angabe, die älter ist, soll man nicht mehr für bare Münze nehmen.
 * Veraltet heisst nicht ausgeblendet: das Datum steht dann hervorgehoben da
 * (docs/markt/schweizer-identitaet.md §2.1).
 */
export const PASS_STATUS_VERALTET_TAGE = 7;

/** Zeilenform von public.pass_status, soweit sie lesbar ist (0112). */
export interface PassStatus {
  route_id: string;
  status: PassStatusWert;
  /** ISO-Datum (YYYY-MM-DD), nur bei geschlossenem Pass. */
  voraussichtlich_offen_ab: string | null;
  hinweis: string | null;
  quelle: string | null;
  geprueft_am: string;
}

export function istPassStrecke(kategorien: readonly string[]): boolean {
  return kategorien.includes("passstrasse");
}

const ZEITZONE = "Europe/Zurich";

function teileInZuerich(d: Date): { jahr: string; monat: string; tag: string } {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZEITZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const hol = (typ: string) => teile.find((t) => t.type === typ)?.value ?? "";
  return { jahr: hol("year"), monat: hol("month"), tag: hol("day") };
}

/** Kalendertag in Zürich als YYYY-MM-DD — Vergleichsgrösse für Datumsfelder. */
export function tagInZuerich(d: Date): string {
  const { jahr, monat, tag } = teileInZuerich(d);
  return `${jahr}-${monat}-${tag}`;
}

export function istVeraltet(geprueftAm: string, jetzt: Date): boolean {
  const alterMs = jetzt.getTime() - Date.parse(geprueftAm);
  return alterMs > PASS_STATUS_VERALTET_TAGE * 24 * 60 * 60 * 1000;
}

// "12.09." im laufenden Jahr, "12.09.2025" sonst. Eine Prüfung aus dem
// Vorjahr ohne Jahreszahl läse sich als diesjährige — genau der Irrtum, den
// das Prüfdatum verhindern soll.
export function pruefDatum(geprueftAm: string, jetzt: Date): string {
  const d = teileInZuerich(new Date(geprueftAm));
  const heute = teileInZuerich(jetzt);
  const kurz = `${d.tag}.${d.monat}.`;
  return d.jahr === heute.jahr ? kurz : `${kurz}${d.jahr}`;
}

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

// "15. Juni" bzw. "15. Juni 2027". Ausgeschriebener Monat, weil eine
// voraussichtliche Öffnung eine Grössenordnung ist, keine Frist — "15.06."
// sähe präziser aus, als es ist. Reines Kalenderdatum ohne Zeitzone: die
// Spalte ist `date`, eine Umrechnung könnte den Tag nur verschieben.
function oeffnungsDatum(isoTag: string, jetzt: Date): string {
  const [jahr, monat, tag] = isoTag.split("-");
  const text = `${Number(tag)}. ${MONATE[Number(monat) - 1]}`;
  return jahr === teileInZuerich(jetzt).jahr ? text : `${text} ${jahr}`;
}

export interface PassStatusAnzeige {
  wert: PassStatusWert;
  label: string;
  /** "voraussichtlich offen ab 15. Juni" oder null. */
  zusatz: string | null;
  /** "geprüft am 12.09." */
  geprueft: string;
  veraltet: boolean;
}

export function passStatusAnzeige(status: PassStatus, jetzt: Date): PassStatusAnzeige {
  const ab = status.voraussichtlich_offen_ab;
  // Eine verstrichene Schätzung weglassen statt anzeigen: "voraussichtlich
  // ab 1. Juni" an einem 20. Juni gesperrten Pass sagt nichts mehr, liest
  // sich aber wie eine Zusage. Das Prüfdatum daneben bleibt die ehrliche
  // Angabe.
  const zusatz =
    status.status !== "offen" && ab && ab >= tagInZuerich(jetzt)
      ? `voraussichtlich offen ab ${oeffnungsDatum(ab, jetzt)}`
      : null;

  return {
    wert: status.status,
    label: PASS_STATUS_LABEL[status.status],
    zusatz,
    geprueft: `geprüft am ${pruefDatum(status.geprueft_am, jetzt)}`,
    veraltet: istVeraltet(status.geprueft_am, jetzt),
  };
}

// ---------------------------------------------------------------------------
// Eingabe aus dem Moderationsformular
// ---------------------------------------------------------------------------

export interface PassStatusEingabe {
  status: PassStatusWert;
  voraussichtlich_offen_ab: string | null;
  hinweis: string | null;
  quelle: string | null;
}

export type PassStatusPruefung =
  | { ok: true; werte: PassStatusEingabe }
  | { ok: false; error: string };

function textOderNull(wert: unknown): string | null {
  if (typeof wert !== "string") return null;
  const getrimmt = wert.trim();
  return getrimmt === "" ? null : getrimmt;
}

function istGueltigesDatum(wert: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
  const d = new Date(`${wert}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === wert;
}

export function pruefePassStatusEingabe(roh: {
  status: unknown;
  voraussichtlich_offen_ab: unknown;
  hinweis: unknown;
  quelle: unknown;
}): PassStatusPruefung {
  const status = roh.status;
  if (typeof status !== "string" || !(PASS_STATUS_WERTE as readonly string[]).includes(status)) {
    return { ok: false, error: "Wähle einen Status: offen, gesperrt oder Wintersperre." };
  }

  const hinweis = textOderNull(roh.hinweis);
  if (hinweis && hinweis.length > PASS_HINWEIS_MAX) {
    return { ok: false, error: `Der Hinweis ist zu lang (höchstens ${PASS_HINWEIS_MAX} Zeichen).` };
  }

  const quelle = textOderNull(roh.quelle);
  if (quelle && quelle.length > PASS_QUELLE_MAX) {
    return { ok: false, error: `Die Quelle ist zu lang (höchstens ${PASS_QUELLE_MAX} Zeichen).` };
  }

  let ab = textOderNull(roh.voraussichtlich_offen_ab);
  if (ab && !istGueltigesDatum(ab)) {
    return { ok: false, error: "Das Öffnungsdatum ist kein gültiges Datum." };
  }
  // An einem offenen Pass gibt es kein "voraussichtlich offen ab" — der
  // CHECK in 0112 lehnt die Kombination ab. Ein im Formular stehen
  // gebliebenes Datum ist beim Umstellen auf "offen" ein Versehen, kein
  // Fehler der Moderatorin: stillschweigend weglassen statt zurückweisen.
  if (status === "offen") ab = null;

  return {
    ok: true,
    werte: {
      status: status as PassStatusWert,
      voraussichtlich_offen_ab: ab,
      hinweis,
      quelle,
    },
  };
}
