// Empfehlung auf der Startseite ("Für dich empfohlen").
//
// Eine Hierarchie aus einer statt aus dreien: Im Grundzustand (keine Suche,
// kein Standort) ist die Empfehlung die bestbewertete Strecke (Schnitt, dann
// Anzahl), und erst wenn es keine belastbare Wertung gibt, die erste der
// Liste. Der Aufrufer (ExploreView.tsx) stellt sie ganz nach oben und zeigt
// bei Suche, Standort oder Ladefehler gar keine: Suche und Nähe-Sortierung
// sind explizite Absichten, in die keine angeheftete Empfehlung gehört —
// deshalb kennt diese Funktion weder Suche noch Standort noch Fehler, nur
// Bestand und Wertungen.
//
// Reine Funktion, damit sie testbar bleibt (siehe empfehlung.test.ts).
import type { Streckenbewertung } from "@/lib/bewertungen";

export type Empfehlungsgrund = "bewertung" | "bestand";

export interface Empfehlung {
  id: string;
  grund: Empfehlungsgrund;
}

/**
 * Ab so vielen Sternen-Wertungen gilt ein Schnitt als belastbar genug, um
 * als "bestbewertet" zu gelten. Darunter wäre die Empfehlung Rauschen: Eine
 * einzelne 5.0 würde eine 4.8 aus fünfzig Stimmen schlagen. Solche
 * Strecken fallen auf den Bestand-Fallback zurück und werden ehrlich ohne
 * "bestbewertet" beschriftet.
 */
export const MINDEST_BEWERTUNGEN_FUER_BESTWERTUNG = 3;

/**
 * Toleranz für den Schnitt-Gleichstand. Schnitte sind Divisionsergebnisse,
 * ein exaktes === ist auf ihnen fragil — innerhalb dieser Bandbreite
 * entscheidet die Anzahl.
 */
const SCHNITT_EPSILON = 1e-9;

function istVerwertbareWertung(
  wertung: Streckenbewertung | undefined,
): wertung is Streckenbewertung {
  return (
    wertung !== undefined &&
    Number.isFinite(wertung.schnitt) &&
    Number.isFinite(wertung.anzahl) &&
    Number.isInteger(wertung.anzahl) &&
    wertung.anzahl >= 1 &&
    wertung.schnitt >= 1 &&
    wertung.schnitt <= 5
  );
}

export function waehleEmpfohleneStrecke(
  routeIds: readonly string[],
  bewertungen: Record<string, Streckenbewertung> = {},
  opts: { ausgeschlossen?: ReadonlySet<string> } = {},
): Empfehlung | null {
  const verfuegbar = opts.ausgeschlossen
    ? routeIds.filter((id) => !opts.ausgeschlossen!.has(id))
    : routeIds;
  if (verfuegbar.length === 0) return null;

  // Höchster Schnitt, Gleichstand nach Anzahl. Nur belastbare Wertungen
  // (Mindestanzahl) dürfen "bestbewertet" werden — der Rest fällt unten
  // auf den Bestand zurück.
  let beste: string | null = null;
  let bestSchnitt = -Infinity;
  let bestAnzahl = -1;
  for (const id of verfuegbar) {
    const wertung = bewertungen[id];
    if (!istVerwertbareWertung(wertung)) continue;
    if (wertung.anzahl < MINDEST_BEWERTUNGEN_FUER_BESTWERTUNG) continue;
    const deutlichBesser = wertung.schnitt - bestSchnitt > SCHNITT_EPSILON;
    const gleichauf =
      beste !== null && Math.abs(wertung.schnitt - bestSchnitt) <= SCHNITT_EPSILON;
    if (beste === null || deutlichBesser || (gleichauf && wertung.anzahl > bestAnzahl)) {
      beste = id;
      bestSchnitt = wertung.schnitt;
      bestAnzahl = wertung.anzahl;
    }
  }
  if (beste !== null) return { id: beste, grund: "bewertung" };

  // Keine belastbare Wertung im Bestand: erste Zeile der Grundordnung, damit
  // die Hierarchie auch dann steht. Beschriftet ohne Grund ("Empfehlung"),
  // weil es keinen zu nennen gibt.
  return { id: verfuegbar[0], grund: "bestand" };
}

// Ein Formatter statt toLocaleString pro Zeile: die Liste ruft das pro
// Strecke auf, das Objekt kostet einmal.
const GANZE_KM_FORMAT = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });

// Luftlinie zum Startpunkt, wie sie in der Liste steht. Unter einem
// Kilometer keine Scheingenauigkeit ("0 km"), darüber gerundet.
export function formatEntfernungKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 1) return "weniger als 1 km";
  return `${GANZE_KM_FORMAT.format(Math.round(km))} km`;
}
