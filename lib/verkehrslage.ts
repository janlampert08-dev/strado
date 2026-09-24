// Die Verkehrseinschätzung einer Strecke ohne Pass.
//
// Auf Passstrecken trägt die Pass-Sektion die Entscheidung ("kann ich los?").
// Ohne Pass gab es bisher nur die Wochenprognose weiter unten (RuhigeZeiten)
// und den Live-Chip auf der Hintergrundkarte — zwei Zahlen, die nie
// zusammengeführt wurden. Diese Datei führt zusammen, was jeweils vorliegt:
//   * Live-Stau (Mapbox tilequery, lib/traffic.ts),
//   * die Vorhersage für die aktuelle Stunde (Mapbox driving-traffic, 0105),
//   * was sonst schon auf der Seite steht (Gemeinschafts-Starts, Profil),
// und sagt ehrlich dazu, welche Quelle was trägt — wie anzeigeFuerStatus
// für Pässe. Rein und ohne Server-Import: die Sektion ist eine
// Client-Komponente (dieselbe Trennung wie lib/ruhigeZeiten.ts).
import { CONGESTION_META, type CongestionLevel } from "@/lib/traffic";
import { stufeFuerFaktor, type Skala, type VerkehrsStufe } from "@/lib/ruhigeZeiten";

/** Live-Stau auf die Stufen der Wochenprognose gelegt — ein Ton für beides. */
export function stufeFuerLive(level: CongestionLevel): VerkehrsStufe {
  switch (level) {
    case "low":
      return "ruhig";
    case "moderate":
      return "normal";
    case "heavy":
      return "dicht";
    case "severe":
      return "zaeh";
  }
}

// Kleingeschrieben für den Satz ("typischerweise belebt"). Die Stufe ist
// seit 2026-09-23 relativ zur Woche der Strecke (lib/ruhigeZeiten.ts,
// skalaFuerPunkte) — derselbe Massstab wie die Wochenübersicht darunter, damit
// "typischerweise ruhig" hier nicht "belebt" dort heisst.
const STUFE_IM_SATZ: Record<VerkehrsStufe, string> = {
  ruhig: "ruhig",
  normal: "mässig belebt",
  dicht: "belebt",
  zaeh: "voll",
};

/**
 * Wochentag (ISO, 1 = Montag) und Stunde in Schweizer Ortszeit — "Sonntag
 * 10 Uhr" ist eine lokale Aussage, und der Server läuft auf Vercel in UTC.
 * Dieselbe Vorsicht wie abfrageZeitpunkte in lib/verkehrsprofil.ts.
 */
export function jetztInZuerich(jetzt: Date = new Date()): { wochentag: number; stunde: number } {
  const datum = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(jetzt);
  // Die Stunde über formatToParts statt über den formatierten Text: "de-CH"
  // liefert "14 Uhr", kein parsebares "14".
  const stundeTeil = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(jetzt)
    .find((teil) => teil.type === "hour");
  const stunde = Number(stundeTeil?.value);
  const [jahr, monat, tag] = datum.split("-").map(Number);
  const tagUtc = new Date(Date.UTC(jahr, monat - 1, tag)).getUTCDay();
  return { wochentag: tagUtc === 0 ? 7 : tagUtc, stunde };
}

/**
 * Der Profilpunkt für genau diese Stunde — oder null. Bewusst kein
 * "nächster" Punkt: das Profil deckt 6–19 Uhr ab (PROFIL_STUNDEN), und eine
 * Aussage über 22 Uhr aus dem 19-Uhr-Wert wäre eine erfundene.
 */
export function prognoseFuerStunde(
  punkte: { wochentag: number; stunde: number; faktor: number }[],
  wochentag: number,
  stunde: number,
): number | null {
  return punkte.find((p) => p.wochentag === wochentag && p.stunde === stunde)?.faktor ?? null;
}

/**
 * "+20 % Fahrzeit gegenüber der ruhigsten Stunde" — der Faktor allein
 * (1,20) sagt niemandem etwas, das Verhältnis zur eigenen ruhigen Stunde
 * schon. Auf ganze Prozent gerundet: die zweite Stelle trägt nichts.
 */
export function faktorText(faktor: number): string {
  const prozent = Math.round((faktor - 1) * 100);
  if (prozent <= 0) return "entspricht der ruhigsten Stunde der Woche";
  return `ca. +${prozent} % Fahrzeit gegenüber der ruhigsten Stunde der Woche`;
}

// Unter diesem Anteil betroffener Stichprobenpunkte heisst die Live-Zeile
// "stellenweise …" statt einer Aussage über die ganze Strecke. Ein Viertel:
// bei der üblichen Dichte (ein Punkt je ~800 m) sind das auf 20 km rund
// 5 km — darunter ist es ein Abschnitt, kein Zustand der Strecke.
export const STELLENWEISE_UNTER = 0.25;

// Kleingeschrieben für "stellenweise …" — "stellenweise Mässig" läse sich
// wie ein Tippfehler.
const LIVE_STELLENWEISE: Record<CongestionLevel, string> = {
  low: "frei",
  moderate: "mässig",
  heavy: "stark",
  severe: "Stau",
};

export interface VerkehrsEingabe {
  live: CongestionLevel | null;
  /**
   * Anteil der Stichprobenpunkte auf der Stufe von `live` oder darüber
   * (anteilMindestens in lib/traffic.ts). Fehlt er, gilt die Aussage wie
   * bisher für die ganze Strecke.
   */
  liveAnteil?: number;
  /** Vorhersagefaktor für die aktuelle Stunde (prognoseFuerStunde) — oder null. */
  prognoseFaktor: number | null;
  /** Die Skala der Wochenübersicht (skalaFuerPunkte) — misst die Stufe. */
  skala: Skala;
  /** Das Profil existiert überhaupt (auch ausserhalb der Stunde). */
  hatPrognose: boolean;
  /** Die Seite zeigt unten den Satz aus den Gemeinschafts-Starts. */
  hatGemeinschaft: boolean;
  /** Die Live-Abfrage läuft noch — kein Beleg, dass es keine Daten gibt. */
  liveLaedt: boolean;
}

export interface VerkehrsEinschaetzung {
  titel: string;
  detail: string | null;
  /** Was was trägt — "Live: Mapbox", "Vorhersage: Mapbox". */
  quellen: string[];
}

/**
 * Eine Zeile zur Jetzt-Lage aus allem, was vorliegt. Die Rangfolge: Live
 * schlägt Vorhersage, Vorhersage schlägt Hinweis — und was fehlt, wird
 * benannt statt verschwiegen ("kein Live-Wert", "noch keine Daten").
 */
export function baueVerkehrseinschaetzung(eingabe: VerkehrsEingabe): VerkehrsEinschaetzung {
  const { live, prognoseFaktor, skala, hatPrognose, hatGemeinschaft, liveLaedt } = eingabe;

  if (live) {
    const quellen = ["Live: Mapbox"];
    const stellenweise =
      live !== "low" &&
      eingabe.liveAnteil !== undefined &&
      eingabe.liveAnteil < STELLENWEISE_UNTER;
    const liveText = stellenweise
      ? `stellenweise ${LIVE_STELLENWEISE[live]}`
      : CONGESTION_META[live].label;
    if (prognoseFaktor !== null) {
      quellen.push("Vorhersage: Mapbox");
      return {
        titel: `Verkehr gerade: ${liveText}`,
        detail: `Üblicherweise ${STUFE_IM_SATZ[stufeFuerFaktor(prognoseFaktor, skala)]} um diese Zeit (${faktorText(prognoseFaktor)}).`,
        quellen,
      };
    }
    return {
      titel: `Verkehr gerade: ${liveText}`,
      detail: null,
      quellen,
    };
  }

  if (prognoseFaktor !== null) {
    const satz = faktorText(prognoseFaktor);
    const detailAnfang = satz.charAt(0).toUpperCase() + satz.slice(1);
    return {
      titel: `Um diese Zeit typischerweise ${STUFE_IM_SATZ[stufeFuerFaktor(prognoseFaktor, skala)]}`,
      detail: `${detailAnfang}.${liveLaedt ? " Live-Abfrage läuft…" : " Kein Live-Wert für diese Stelle."}`,
      quellen: ["Vorhersage: Mapbox"],
    };
  }

  if (liveLaedt) {
    return { titel: "Live-Verkehr wird geladen…", detail: null, quellen: [] };
  }

  if (hatPrognose) {
    return {
      titel: "Ausserhalb der Vorhersagezeit",
      detail: "Das Profil deckt 6–19 Uhr ab — die Wochenübersicht unten gilt trotzdem.",
      quellen: ["Vorhersage: Mapbox"],
    };
  }

  if (hatGemeinschaft) {
    return {
      titel: "Keine Live-Daten für diese Strecke",
      detail: "Unten steht, wann andere hier losfahren.",
      quellen: [],
    };
  }

  return {
    titel: "Noch keine Verkehrsdaten",
    detail: "Weder Live noch Vorhersage — Mapbox kennt hier keinen Verkehrsfluss oder die Strecke ist neu.",
    quellen: [],
  };
}
