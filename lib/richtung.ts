import { haversineKm } from "@/lib/geo";

// Diskrete Fahrtrichtungsanzeige: Wurde eine Punkt-zu-Punkt-Strecke von A
// nach B oder von B nach A gefahren? Die Antwort steht in keinem
// Datenfeld — sie ergibt sich aus dem Track-Anfang gegen die beiden
// Streckenenden. Rein darstellend (Fahrtseite), an keiner Wertung oder
// Abfrage beteiligt.
//
// Toleranz wie die Start/Ziel-Gates (lib/tracking.ts): Wer weiter als
// 500 m vom jeweiligen Ende begonnen hat, bekommt keine Richtung
// zugeschrieben — dann war es weder das eine noch das andere.
export const RICHTUNG_TOLERANZ_KM = 0.5;

export type Fahrtrichtung = "hin" | "zurueck";

/**
 * Vergleicht den Track-Anfang mit Start- und Zielpunkt der Strecke.
 * Gibt "hin" (ab Start), "zurueck" (ab Ziel) oder null (Rundfahrt,
 * unklarer Start, beides/keines in Toleranz).
 */
export function erkannteFahrtrichtung(
  trackStart: [number, number] | null,
  streckenStart: [number, number],
  streckenZiel: [number, number],
  istRundfahrt: boolean,
): Fahrtrichtung | null {
  if (istRundfahrt || trackStart === null) return null;
  const nahAmStart = haversineKm(trackStart, streckenStart) <= RICHTUNG_TOLERANZ_KM;
  const nahAmZiel = haversineKm(trackStart, streckenZiel) <= RICHTUNG_TOLERANZ_KM;
  // Beides oder keines: keine Aussage statt einer geratenen.
  if (nahAmStart === nahAmZiel) return null;
  return nahAmStart ? "hin" : "zurueck";
}
