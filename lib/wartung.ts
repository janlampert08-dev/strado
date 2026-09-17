// Wartungsheft: Einträge, Kilometerschätzung und Fälligkeiten pro Fahrzeug.
//
// Reine Funktionen ohne jeden Server-Import — das Formular
// (components/WartungseintragForm.tsx) ist eine Client Component und holt
// die Arten und Grenzwerte von hier. Dieselbe Falle wie bei
// lib/premiumLimits.ts: ein Import aus einem Modul, das lib/supabase/**
// zieht, bräche den Client-Build. Die Abfragen liegen deshalb nebenan in
// lib/wartungsdaten.ts.
//
// ---------------------------------------------------------------------------
// Die eine Zahl, die Strado ehrlich nennen kann
// ---------------------------------------------------------------------------
// Strado kennt nicht jeden Kilometer eines Fahrzeugs, nur die aufgezeichneten.
// Wer einen Teil seiner Fahrten nicht aufzeichnet — und das ist der
// Normalfall, der Arbeitsweg läuft nicht über Strado —, hat mehr Kilometer
// auf der Uhr, als Strado sieht. Jede Kilometerzahl hier ist deshalb eine
// UNTERGRENZE, und jede Funktion ist so gebaut, dass sie eine bleibt:
//
//   - Fahrten am selben Tag wie ein Eintrag zählen NICHT dazu. Ob der
//     Kilometerstand vor oder nach der Fahrt abgelesen wurde, weiss niemand;
//     sie mitzuzählen könnte die Schätzung über den echten Stand heben.
//   - Fahrten ohne distanz_km zählen null, nicht einen Mittelwert.
//   - Automatisch erkannte Streckenabschnitte (parent_completion_id, 0050)
//     liegen INNERHALB einer freien Fahrt, die ihre Kilometer schon trägt.
//     Sie auszufiltern ist Sache der Abfrage (lib/wartungsdaten.ts); hier
//     kommt nur an, was zählen darf.
//
// Daraus folgt die Wortwahl in der Oberfläche: "mindestens 12 400 km",
// "Service in höchstens 600 km" — und daraus folgt auch, warum hier, anders
// als docs/premium-ausbau-plan.md §4 es für die reine Streckensumme
// vorschlug, eine Fälligkeit nach Kilometern überhaupt gemeldet werden darf:
// Ist schon die Untergrenze über dem Intervall, ist der Service sicher fällig.
// Eine falsche Warnung kann aus einer Untergrenze nicht entstehen, nur eine
// verspätete. Das sagt die Oberfläche dazu.
//
// ---------------------------------------------------------------------------
// Datumswerte bleiben Zeichenketten
// ---------------------------------------------------------------------------
// Alle Daten sind DATE-Spalten im Format "YYYY-MM-DD". Gerechnet wird in
// ganzen Tagen seit der Epoche über Date.UTC, nie über `new Date(string)` in
// lokaler Zeit — derselbe Grund wie in lib/fahrtstatistik.ts: sonst rutscht
// ein Datum je nach Zeitzone des Rechners um einen Tag. "Heute" kommt als
// Parameter herein (todayInZurich() aus lib/format.ts), damit die Tests
// nicht von der Uhr abhängen.

// ---------------------------------------------------------------------------
// Arten
// ---------------------------------------------------------------------------

/**
 * Deckungsgleich mit dem CHECK auf wartungseintraege.art
 * (0111_wartungsheft.sql). Wer eine Art ergänzt, ergänzt beide.
 *
 * Schweizer Begriffe: Pneu statt Reifen, MFK (Motorfahrzeugkontrolle beim
 * kantonalen Strassenverkehrsamt) statt TÜV oder HU. "Kette/Antrieb" steht
 * für den Kettensatz am Motorrad wie für Riemen und Kardan — die Oberfläche
 * zeigt sie beim Auto trotzdem nicht an (siehe artenFuer).
 */
export const WARTUNGSARTEN = [
  "service",
  "mfk",
  "pneuwechsel",
  "bremsen",
  "batterie",
  "kette",
  "sonstiges",
] as const;

export type Wartungsart = (typeof WARTUNGSARTEN)[number];

export const WARTUNGSART_LABEL: Record<Wartungsart, string> = {
  service: "Service",
  mfk: "MFK",
  pneuwechsel: "Pneuwechsel",
  bremsen: "Bremsen",
  batterie: "Batterie",
  kette: "Kette/Antrieb",
  sonstiges: "Sonstiges",
};

export function istWartungsart(wert: string): wert is Wartungsart {
  return (WARTUNGSARTEN as readonly string[]).includes(wert);
}

/**
 * Welche Arten das Formular für einen Fahrzeugtyp anbietet. Nur eine
 * Auswahlhilfe: die Server Action und der CHECK nehmen jede Art für jedes
 * Fahrzeug an, damit ein einmal gespeicherter Eintrag nie an einer
 * späteren Einschränkung scheitert.
 */
export function artenFuer(typ: "auto" | "motorrad"): Wartungsart[] {
  return typ === "auto" ? WARTUNGSARTEN.filter((a) => a !== "kette") : [...WARTUNGSARTEN];
}

// ---------------------------------------------------------------------------
// Grenzwerte — jeder davon steht als CHECK in 0111_wartungsheft.sql
// ---------------------------------------------------------------------------

/** Frühestes Datum für Einträge und MFK-Termin. Deckt auch Oldtimer ab. */
export const FRUEHESTES_DATUM = "1950-01-01";
export const MAX_KM_STAND = 2_000_000;
/** Franken, zwei Nachkommastellen. Mehr als ein Motorschaden kostet selten. */
export const MAX_KOSTEN_CHF = 100_000;
export const MAX_NOTIZ_LAENGE = 500;
/**
 * Wie weit ein MFK-Termin in der Zukunft liegen darf. Sechs statt zwei
 * Jahre: ein neuer Personenwagen muss erst nach fünf Jahren zur ersten MFK
 * (Rhythmus 5-3-2-2), und wer den Termin aus dem Fahrzeugausweis kennt, soll
 * ihn eintragen können.
 */
export const MFK_MAX_JAHRE_VORAUS = 6;
export const MIN_INTERVALL_KM = 100;
export const MAX_INTERVALL_KM = 100_000;
export const MIN_INTERVALL_MONATE = 1;
export const MAX_INTERVALL_MONATE = 60;

// ---------------------------------------------------------------------------
// Schwellen der Fälligkeit
// ---------------------------------------------------------------------------

/** Ab so vielen Tagen vor dem Termin heisst es "bald". */
export const BALD_TAGE = 30;
/** Ab so vielen Tagen vor dem Termin heisst es "fällig". */
export const FAELLIG_TAGE = 7;
/** Ab so vielen (höchstens verbleibenden) Kilometern heisst es "bald". */
export const BALD_KM = 500;
/** Ab so vielen (höchstens verbleibenden) Kilometern heisst es "fällig". */
export const FAELLIG_KM = 100;
/**
 * Eine MFK, die höchstens so viele Tage vor dem eingetragenen Termin
 * gemacht wurde, gilt als die zu diesem Termin. Ohne das bliebe der Termin
 * nach bestandener Prüfung stehen und würde eine Woche später als
 * "überfällig" gemeldet, obwohl alles erledigt ist. Ein halbes Jahr, weil
 * das Aufgebot des Strassenverkehrsamts meist ein paar Monate vorher kommt
 * und man früher vorführen darf.
 */
export const MFK_ERLEDIGT_FENSTER_TAGE = 183;

export type WartungsStatus = "ok" | "bald" | "faellig" | "ueberfaellig";

const STATUS_RANG: Record<WartungsStatus, number> = {
  ok: 0,
  bald: 1,
  faellig: 2,
  ueberfaellig: 3,
};

export function schlimmsterStatus(a: WartungsStatus, b: WartungsStatus): WartungsStatus {
  return STATUS_RANG[a] >= STATUS_RANG[b] ? a : b;
}

/** Braucht die Profilseite eine Zeile dafür? */
export function istMeldenswert(status: WartungsStatus): boolean {
  return status !== "ok";
}

// ---------------------------------------------------------------------------
// Datumsrechnung in ganzen Tagen
// ---------------------------------------------------------------------------

const DATUM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" → Tage seit 1970-01-01, oder null bei ungültigem Datum
 *  (auch 2026-02-30, das Date.UTC sonst stillschweigend in den März schöbe). */
export function tagNummer(datum: string): number | null {
  const m = DATUM_RE.exec(datum);
  if (!m) return null;
  const jahr = Number(m[1]);
  const monat = Number(m[2]);
  const tag = Number(m[3]);
  const ms = Date.UTC(jahr, monat - 1, tag);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== jahr || d.getUTCMonth() !== monat - 1 || d.getUTCDate() !== tag) {
    return null;
  }
  return Math.round(ms / 86_400_000);
}

/**
 * Datum plus Monate, auf das Monatsende gekappt: 31.01. + 1 Monat ist der
 * 28. (oder 29.) Februar, nicht der 3. März. Ein Serviceintervall "alle 12
 * Monate" ab dem 29.02. endet so am 28.02. des Folgejahres — früher statt
 * später, die sichere Seite für eine Erinnerung.
 */
export function plusMonate(datum: string, monate: number): string {
  const m = DATUM_RE.exec(datum);
  if (!m) throw new Error(`Ungültiges Datum: ${datum}`);
  const jahr = Number(m[1]);
  const monatIndex = Number(m[2]) - 1 + monate;
  const zielJahr = jahr + Math.floor(monatIndex / 12);
  const zielMonat = ((monatIndex % 12) + 12) % 12;
  const letzterTag = new Date(Date.UTC(zielJahr, zielMonat + 1, 0)).getUTCDate();
  const tag = Math.min(Number(m[3]), letzterTag);
  return `${String(zielJahr).padStart(4, "0")}-${String(zielMonat + 1).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

export function plusJahre(datum: string, jahre: number): string {
  return plusMonate(datum, jahre * 12);
}

/** b − a in Tagen. */
export function tageZwischen(a: string, b: string): number {
  const na = tagNummer(a);
  const nb = tagNummer(b);
  if (na === null || nb === null) throw new Error(`Ungültiges Datum: ${a} / ${b}`);
  return nb - na;
}

// ---------------------------------------------------------------------------
// Kilometerschätzung
// ---------------------------------------------------------------------------

export interface EintragFuerBerechnung {
  art: Wartungsart;
  /** "YYYY-MM-DD" */
  datum: string;
  km_stand: number | null;
  /** Tiebreaker bei gleichem Datum; ISO-Zeitstempel. */
  created_at: string;
}

export interface FahrtFuerBerechnung {
  /** "YYYY-MM-DD" */
  datum: string;
  distanz_km: number | null;
}

/** Summe der aufgezeichneten Kilometer strikt NACH einem Datum. */
export function fahrtKmNach(fahrten: readonly FahrtFuerBerechnung[], datum: string): number {
  const grenze = tagNummer(datum);
  if (grenze === null) return 0;
  let summe = 0;
  for (const fahrt of fahrten) {
    const tag = tagNummer(fahrt.datum);
    if (tag === null || tag <= grenze) continue;
    const km = fahrt.distanz_km;
    // Negative oder kaputte Werte würden die Untergrenze senken und damit
    // nichts Falsches behaupten — sie trotzdem zu überspringen hält die Zahl
    // in der Anzeige vernünftig. 0074 begrenzt distanz_km ohnehin.
    if (typeof km === "number" && Number.isFinite(km) && km > 0) summe += km;
  }
  return summe;
}

export interface KmSchaetzung {
  /** Mindestens so viele Kilometer stehen heute auf dem Zähler. */
  mindestensKm: number;
  /** Der Eintrag, von dem die Schätzung ausgeht. */
  ausgehendVonDatum: string;
  ausgehendVonKm: number;
  /** Davon auf Strado aufgezeichnet, seit jenem Eintrag. */
  aufgezeichnetKm: number;
}

/**
 * Heutiger Kilometerstand, mindestens.
 *
 * Für JEDEN Eintrag mit Kilometerstand ist "Stand + aufgezeichnete Fahrten
 * danach" eine Untergrenze; das Maximum aller Untergrenzen ist wieder eine
 * und zugleich die beste. Das ist robuster als "der jüngste Eintrag":
 * vertippt sich jemand im jüngsten Eintrag nach unten, trägt ein älterer
 * mit Fahrten danach die Zahl weiter.
 *
 * null, wenn kein einziger Eintrag einen Kilometerstand trägt — aus
 * Fahrten allein lässt sich kein Zählerstand ableiten.
 */
export function schaetzeKmStand(
  eintraege: readonly EintragFuerBerechnung[],
  fahrten: readonly FahrtFuerBerechnung[],
): KmSchaetzung | null {
  let beste: KmSchaetzung | null = null;
  for (const eintrag of eintraege) {
    if (eintrag.km_stand === null || tagNummer(eintrag.datum) === null) continue;
    const aufgezeichnetKm = fahrtKmNach(fahrten, eintrag.datum);
    const mindestensKm = eintrag.km_stand + aufgezeichnetKm;
    if (beste === null || mindestensKm > beste.mindestensKm) {
      beste = {
        mindestensKm,
        ausgehendVonDatum: eintrag.datum,
        ausgehendVonKm: eintrag.km_stand,
        aufgezeichnetKm,
      };
    }
  }
  if (beste === null) return null;
  return {
    ...beste,
    mindestensKm: Math.round(beste.mindestensKm),
    aufgezeichnetKm: Math.round(beste.aufgezeichnetKm),
  };
}

/** Jüngster Eintrag einer Art — nach Datum, bei Gleichstand nach Erfassung. */
export function juengsterEintrag<T extends EintragFuerBerechnung>(
  eintraege: readonly T[],
  art: Wartungsart,
): T | null {
  let juengster: T | null = null;
  for (const e of eintraege) {
    if (e.art !== art) continue;
    if (
      juengster === null ||
      e.datum > juengster.datum ||
      (e.datum === juengster.datum && e.created_at > juengster.created_at)
    ) {
      juengster = e;
    }
  }
  return juengster;
}

/** Einträge neueste zuerst, für die Liste. */
export function sortiereNeuesteZuerst<T extends EintragFuerBerechnung>(eintraege: readonly T[]): T[] {
  return [...eintraege].sort((a, b) =>
    a.datum === b.datum ? b.created_at.localeCompare(a.created_at) : b.datum.localeCompare(a.datum),
  );
}

// ---------------------------------------------------------------------------
// Fälligkeiten
// ---------------------------------------------------------------------------

export function statusNachTagen(tageBisTermin: number): WartungsStatus {
  if (tageBisTermin < 0) return "ueberfaellig";
  if (tageBisTermin <= FAELLIG_TAGE) return "faellig";
  if (tageBisTermin <= BALD_TAGE) return "bald";
  return "ok";
}

/** restKm ist eine OBERGRENZE der verbleibenden Kilometer (siehe Dateikopf). */
export function statusNachKm(restKm: number): WartungsStatus {
  if (restKm < 0) return "ueberfaellig";
  if (restKm <= FAELLIG_KM) return "faellig";
  if (restKm <= BALD_KM) return "bald";
  return "ok";
}

export interface Erinnerungseinstellungen {
  naechste_mfk_am: string | null;
  service_intervall_km: number | null;
  service_intervall_monate: number | null;
}

export type MfkErinnerung =
  | { zustand: "kein_termin" }
  /** Eine MFK ist kurz vor dem Termin eingetragen — neuer Termin fehlt. */
  | { zustand: "erledigt"; termin: string; erledigtAm: string }
  | { zustand: "offen"; termin: string; tage: number; status: WartungsStatus };

export function mfkErinnerung(
  einstellungen: Erinnerungseinstellungen | null,
  eintraege: readonly EintragFuerBerechnung[],
  heute: string,
): MfkErinnerung {
  const termin = einstellungen?.naechste_mfk_am ?? null;
  if (!termin || tagNummer(termin) === null) return { zustand: "kein_termin" };

  const letzteMfk = juengsterEintrag(eintraege, "mfk");
  if (letzteMfk && tageZwischen(letzteMfk.datum, termin) <= MFK_ERLEDIGT_FENSTER_TAGE) {
    return { zustand: "erledigt", termin, erledigtAm: letzteMfk.datum };
  }

  const tage = tageZwischen(heute, termin);
  return { zustand: "offen", termin, tage, status: statusNachTagen(tage) };
}

export type ServiceErinnerung =
  | { zustand: "kein_intervall" }
  | { zustand: "kein_service" }
  | {
      zustand: "offen";
      letzterServiceAm: string;
      status: WartungsStatus;
      /** Nur mit Monatsintervall. */
      faelligAm: string | null;
      tage: number | null;
      /** Nur mit Kilometerintervall. Seit dem Service mindestens gefahren. */
      kmSeitService: number | null;
      /** Höchstens noch so viele Kilometer bis zum Service; negativ = drüber. */
      restKm: number | null;
      /**
       * Woher kmSeitService stammt: aus zwei Kilometerständen plus Fahrten
       * ("kilometerstand"), oder allein aus den aufgezeichneten Fahrten seit
       * dem Servicedatum ("fahrten"), wenn beim Service kein Stand notiert
       * wurde. Beides Untergrenzen; die zweite ist die schwächere.
       */
      kmQuelle: "kilometerstand" | "fahrten" | null;
      /** Welche der beiden Grössen den Status bestimmt. */
      massgeblich: "datum" | "km";
    };

export function serviceErinnerung(
  einstellungen: Erinnerungseinstellungen | null,
  eintraege: readonly EintragFuerBerechnung[],
  fahrten: readonly FahrtFuerBerechnung[],
  heute: string,
): ServiceErinnerung {
  const intervallKm = einstellungen?.service_intervall_km ?? null;
  const intervallMonate = einstellungen?.service_intervall_monate ?? null;
  if (intervallKm === null && intervallMonate === null) return { zustand: "kein_intervall" };

  const letzter = juengsterEintrag(eintraege, "service");
  if (!letzter || tagNummer(letzter.datum) === null) return { zustand: "kein_service" };

  let faelligAm: string | null = null;
  let tage: number | null = null;
  let statusDatum: WartungsStatus | null = null;
  if (intervallMonate !== null) {
    faelligAm = plusMonate(letzter.datum, intervallMonate);
    tage = tageZwischen(heute, faelligAm);
    statusDatum = statusNachTagen(tage);
  }

  let kmSeitService: number | null = null;
  let restKm: number | null = null;
  let kmQuelle: "kilometerstand" | "fahrten" | null = null;
  let statusKm: WartungsStatus | null = null;
  if (intervallKm !== null) {
    const schaetzung = schaetzeKmStand(eintraege, fahrten);
    if (letzter.km_stand !== null && schaetzung !== null) {
      // Die Schätzung schliesst den Serviceeintrag selbst ein, liegt also
      // nie unter km_stand + Fahrten danach — die Differenz ist >= der
      // reinen Fahrtensumme und damit die bessere Untergrenze.
      kmSeitService = Math.max(0, schaetzung.mindestensKm - letzter.km_stand);
      kmQuelle = "kilometerstand";
    } else {
      kmSeitService = Math.round(fahrtKmNach(fahrten, letzter.datum));
      kmQuelle = "fahrten";
    }
    restKm = intervallKm - kmSeitService;
    statusKm = statusNachKm(restKm);
  }

  let status: WartungsStatus;
  let massgeblich: "datum" | "km";
  if (statusDatum !== null && statusKm !== null) {
    // "Was zuerst eintritt", wie jedes Serviceheft es formuliert.
    status = schlimmsterStatus(statusDatum, statusKm);
    massgeblich = STATUS_RANG[statusKm] > STATUS_RANG[statusDatum] ? "km" : "datum";
  } else if (statusDatum !== null) {
    status = statusDatum;
    massgeblich = "datum";
  } else {
    status = statusKm as WartungsStatus;
    massgeblich = "km";
  }

  return {
    zustand: "offen",
    letzterServiceAm: letzter.datum,
    status,
    faelligAm,
    tage,
    kmSeitService,
    restKm,
    kmQuelle,
    massgeblich,
  };
}

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

/**
 * Tausendertrennung wie in der Schweiz üblich: 12'400. Von Hand statt über
 * Intl.NumberFormat("de-CH"): je nach ICU-Stand trennt das mit ' oder mit ’,
 * und Server und Browser müssen für die Hydration dasselbe Zeichen liefern.
 */
export function tausender(n: number): string {
  const ganz = Math.round(n);
  const vorzeichen = ganz < 0 ? "-" : "";
  return vorzeichen + String(Math.abs(ganz)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

export function kmText(km: number): string {
  return `${tausender(km)} km`;
}

/** "YYYY-MM-DD" → "08.09.2026", ohne Umweg über lokale Zeit. */
export function datumText(datum: string): string {
  const m = DATUM_RE.exec(datum);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : datum;
}

/** "in 3 Wochen", "morgen", "heute", "seit 5 Tagen". */
export function relativeTage(tage: number): string {
  if (tage === 0) return "heute";
  if (tage === 1) return "morgen";
  if (tage === -1) return "seit gestern";
  const betrag = Math.abs(tage);
  let spanne: string;
  if (betrag < 14) spanne = `${betrag} Tagen`;
  else if (betrag < 61) spanne = `${Math.floor(betrag / 7)} Wochen`;
  else spanne = `${Math.floor(betrag / 30)} Monaten`;
  return tage > 0 ? `in ${spanne}` : `seit ${spanne}`;
}

/**
 * Die eine kurze Zeile für die Fahrzeugkachel im Profil — oder null, wenn
 * nichts ansteht. Steht nur da, wenn etwas bald, fällig oder überfällig ist;
 * eine Kachel, die "MFK in 14 Monaten" sagt, ist Rauschen.
 * Sind MFK und Service beide meldenswert, gewinnt der dringlichere.
 */
export function kurzhinweis(
  mfk: MfkErinnerung,
  service: ServiceErinnerung,
): { text: string; status: WartungsStatus } | null {
  const kandidaten: { text: string; status: WartungsStatus; rang: number }[] = [];

  if (mfk.zustand === "offen" && istMeldenswert(mfk.status)) {
    kandidaten.push({
      text: mfk.tage < 0 ? `MFK überfällig, ${relativeTage(mfk.tage)}` : `MFK ${relativeTage(mfk.tage)}`,
      status: mfk.status,
      rang: STATUS_RANG[mfk.status],
    });
  }

  if (service.zustand === "offen" && istMeldenswert(service.status)) {
    let text: string;
    if (service.massgeblich === "km" && service.restKm !== null) {
      text =
        service.restKm < 0
          ? `Service überfällig, ${kmText(-service.restKm)} drüber`
          : `Service in höchstens ${kmText(service.restKm)}`;
    } else if (service.tage !== null) {
      text =
        service.tage < 0
          ? `Service überfällig, ${relativeTage(service.tage)}`
          : `Service ${relativeTage(service.tage)}`;
    } else {
      text = "Service fällig";
    }
    kandidaten.push({ text, status: service.status, rang: STATUS_RANG[service.status] });
  }

  if (kandidaten.length === 0) return null;
  // Stabil: bei gleichem Rang bleibt die MFK vorn — sie ist gesetzlich.
  const dringlichster = kandidaten.reduce((a, b) => (b.rang > a.rang ? b : a));
  return { text: dringlichster.text, status: dringlichster.status };
}

// ---------------------------------------------------------------------------
// Eingabeprüfung — dieselben Regeln wie die CHECKs in 0111
// ---------------------------------------------------------------------------

export type Pruefung<T> = { ok: true; wert: T } | { ok: false; fehler: string };

/** Ganze Zahl aus einem Formularfeld; leer → null. Apostroph und
 *  Leerzeichen als Tausendertrennung sind erlaubt ("12'400"). */
export function ganzeZahlOderLeer(roh: string): number | null | "ungueltig" {
  const bereinigt = roh.trim().replace(/['’\s]/g, "");
  if (!bereinigt) return null;
  if (!/^\d+$/.test(bereinigt)) return "ungueltig";
  const n = Number(bereinigt);
  return Number.isSafeInteger(n) ? n : "ungueltig";
}

/** Franken mit höchstens zwei Nachkommastellen, Komma oder Punkt. */
export function frankenOderLeer(roh: string): number | null | "ungueltig" {
  const bereinigt = roh.trim().replace(/['’\s]/g, "").replace(",", ".");
  if (!bereinigt) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(bereinigt)) return "ungueltig";
  const n = Number(bereinigt);
  return Number.isFinite(n) ? n : "ungueltig";
}

export interface EintragEingabe {
  art: Wartungsart;
  datum: string;
  km_stand: number | null;
  kosten_chf: number | null;
  notiz: string | null;
}

export function pruefeEintrag(
  roh: { art: string; datum: string; km_stand: string; kosten_chf: string; notiz: string },
  heute: string,
): Pruefung<EintragEingabe> {
  const art = roh.art.trim();
  if (!istWartungsart(art)) return { ok: false, fehler: "Bitte wähle, was gemacht wurde." };

  const datum = roh.datum.trim();
  if (tagNummer(datum) === null) return { ok: false, fehler: "Bitte gib ein gültiges Datum ein." };
  if (datum < FRUEHESTES_DATUM) {
    return { ok: false, fehler: "Das Datum darf nicht vor 1950 liegen." };
  }
  if (datum > heute) {
    return { ok: false, fehler: "Das Datum darf nicht in der Zukunft liegen." };
  }

  const km = ganzeZahlOderLeer(roh.km_stand);
  if (km === "ungueltig" || (km !== null && km > MAX_KM_STAND)) {
    return {
      ok: false,
      fehler: `Kilometerstand: eine ganze Zahl zwischen 0 und ${kmText(MAX_KM_STAND)}.`,
    };
  }

  const kosten = frankenOderLeer(roh.kosten_chf);
  if (kosten === "ungueltig" || (kosten !== null && kosten > MAX_KOSTEN_CHF)) {
    return {
      ok: false,
      fehler: `Kosten: ein Betrag in Franken zwischen 0 und ${tausender(MAX_KOSTEN_CHF)}.`,
    };
  }

  const notiz = roh.notiz.trim();
  if (notiz.length > MAX_NOTIZ_LAENGE) {
    return { ok: false, fehler: `Die Notiz darf höchstens ${MAX_NOTIZ_LAENGE} Zeichen lang sein.` };
  }

  return {
    ok: true,
    wert: { art, datum, km_stand: km, kosten_chf: kosten, notiz: notiz || null },
  };
}

export function pruefeErinnerungen(
  roh: { naechste_mfk_am: string; service_intervall_km: string; service_intervall_monate: string },
  heute: string,
): Pruefung<Erinnerungseinstellungen> {
  const mfk = roh.naechste_mfk_am.trim();
  let naechsteMfk: string | null = null;
  if (mfk) {
    if (tagNummer(mfk) === null) return { ok: false, fehler: "Bitte gib für die MFK ein gültiges Datum ein." };
    if (mfk < FRUEHESTES_DATUM || mfk > plusJahre(heute, MFK_MAX_JAHRE_VORAUS)) {
      return {
        ok: false,
        fehler: `Der MFK-Termin muss zwischen 1950 und ${MFK_MAX_JAHRE_VORAUS} Jahren ab heute liegen.`,
      };
    }
    naechsteMfk = mfk;
  }

  const km = ganzeZahlOderLeer(roh.service_intervall_km);
  if (km === "ungueltig" || (km !== null && (km < MIN_INTERVALL_KM || km > MAX_INTERVALL_KM))) {
    return {
      ok: false,
      fehler: `Serviceintervall: zwischen ${kmText(MIN_INTERVALL_KM)} und ${kmText(MAX_INTERVALL_KM)}.`,
    };
  }

  const monate = ganzeZahlOderLeer(roh.service_intervall_monate);
  if (
    monate === "ungueltig" ||
    (monate !== null && (monate < MIN_INTERVALL_MONATE || monate > MAX_INTERVALL_MONATE))
  ) {
    return {
      ok: false,
      fehler: `Serviceintervall: zwischen ${MIN_INTERVALL_MONATE} und ${MAX_INTERVALL_MONATE} Monaten.`,
    };
  }

  return {
    ok: true,
    wert: { naechste_mfk_am: naechsteMfk, service_intervall_km: km, service_intervall_monate: monate },
  };
}

/** Alle drei leer: dann gibt es nichts zu speichern, die Zeile geht weg. */
export function erinnerungenLeer(e: Erinnerungseinstellungen): boolean {
  return e.naechste_mfk_am === null && e.service_intervall_km === null && e.service_intervall_monate === null;
}
