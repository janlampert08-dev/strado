import { haversineKm } from "@/lib/geo";

// Der Vorschlag auf dem Startschirm der freien Fahrt: "Klausenpass startet
// 400 m von dir – als Streckenfahrt fahren?"
//
// WARUM
//
// Wer am Startpunkt einer kuratierten Strecke steht und "Freie Fahrt" tippt,
// weiss oft nicht, dass die Strecke da ist. Eine Streckenfahrt startet und
// stoppt die Zeitmessung selbst am Start- und Zielpunkt und zeigt unterwegs,
// wie viel noch fehlt; eine freie Fahrt erkennt die Strecke erst beim
// Speichern, und nur, wenn sie vollständig gefahren wurde
// (lib/lapDetection.ts). Der Hinweis kommt deshalb VOR dem Start — danach
// ist die Wahl getroffen.
//
// Er ist ein Angebot, keine Weiche: der Link führt auf die Streckenseite,
// gestartet wird dort. Die freie Fahrt bleibt mit einem Tippen startbar,
// dieser Vorschlag hält nichts an und verzögert nichts.

/** Radius um den Startpunkt einer Strecke, in dem sie vorgeschlagen wird. */
export const VORSCHLAG_RADIUS_M = 600;

/**
 * Schlechter als so genau darf der Standort nicht sein, sonst kein
 * Vorschlag. Eine Funkzellen-Ortung (oft 1–3 km) setzt den Punkt irgendwo
 * ins Quartier; "startet 400 m von dir" wäre dann geraten. Grosszügiger als
 * die "bereit"-Schwelle der GPS-Zeile (lib/gpsBereitschaft.ts), weil es hier
 * nur um die Frage "steht man in der Nähe?" geht und nicht um einen
 * Messpunkt — aber deutlich kleiner als der Radius selbst.
 */
export const VORSCHLAG_MAX_UNGENAUIGKEIT_M = 150;

/** Das Minimum einer Strecke, das die Auswahl braucht (ExploreRoute erfüllt es). */
export interface VorschlagsStrecke {
  id: string;
  name: string;
  start_geojson: { coordinates: [number, number] };
}

export interface Streckenvorschlag {
  id: string;
  name: string;
  distanzM: number;
}

/**
 * Die Strecke, deren Startpunkt dem Standort am nächsten liegt — sofern er
 * innerhalb von VORSCHLAG_RADIUS_M liegt und der Standort genau genug ist.
 * Sonst null. Nur der START zählt: am Ziel einer Punkt-zu-Punkt-Strecke
 * zu stehen, hilft für eine Streckenfahrt nichts, die Zeitmessung beginnt
 * am Start (lib/tracking.ts). Bei einer Rundfahrt fallen beide zusammen.
 */
export function naechsteStreckeAmStart(
  standort: [number, number] | null,
  genauigkeitM: number | null,
  strecken: readonly VorschlagsStrecke[],
): Streckenvorschlag | null {
  if (!standort) return null;
  if (genauigkeitM == null || !Number.isFinite(genauigkeitM)) return null;
  if (genauigkeitM > VORSCHLAG_MAX_UNGENAUIGKEIT_M) return null;

  let beste: Streckenvorschlag | null = null;
  for (const strecke of strecken) {
    const start = strecke.start_geojson?.coordinates;
    // Eine Zeile ohne brauchbaren Startpunkt wird übergangen, statt die
    // ganze Auswahl mit NaN zu vergiften.
    if (!start || !Number.isFinite(start[0]) || !Number.isFinite(start[1])) continue;
    const distanzM = haversineKm(standort, start) * 1000;
    if (distanzM > VORSCHLAG_RADIUS_M) continue;
    if (!beste || distanzM < beste.distanzM) {
      beste = { id: strecke.id, name: strecke.name, distanzM };
    }
  }
  return beste;
}

/**
 * Der Abstand im Satz "… startet 400 m von dir". Auf 50 m gerundet: die
 * Ortung schwankt am Stand um mehr als das, und eine Zahl, die bei jedem
 * Fix springt ("412 m", "397 m"), lenkt ab. Unter 50 m wird daraus "hier" —
 * "startet 0 m von dir" liest sich wie ein Fehler.
 */
export function vorschlagsText(vorschlag: Streckenvorschlag): string {
  const gerundet = Math.round(vorschlag.distanzM / 50) * 50;
  if (gerundet < 50) return `${vorschlag.name} startet hier – als Streckenfahrt fahren?`;
  return `${vorschlag.name} startet ${gerundet} m von dir – als Streckenfahrt fahren?`;
}
