// Die Einrichtung nach der Registrierung (/einrichten): Fahrzeug, Pässe,
// fertig. Hier liegt der reine Teil — was als erledigt gilt, wohin es danach
// geht, welche Pässe vorgeschlagen werden. Nur für den Server: über
// lib/utils/url.ts hängt next/headers daran, eine Client-Komponente darf das
// nicht importieren (die premiumLimits.ts-Falle aus AGENTS.md). Die Seite
// rechnet deshalb alles hier aus und reicht Werte hinunter.

import { safeInternalPath } from "@/lib/utils/url";

export const EINRICHTUNG_PFAD = "/einrichten";

/**
 * Der Schlüssel in den Nutzer-Metadaten (auth.users.raw_user_meta_data),
 * unter dem der Abschluss steht. Bewusst dort und nicht in profiles: dafür
 * braucht es keine Migration, und es gilt geräteübergreifend — anders als
 * localStorage, womit die alte Checkliste vom September auf jedem neuen
 * Gerät wieder auftauchte. Der Wert ist nur ein Anzeige-Merker; wer ihn von
 * Hand setzt, überspringt sich selbst die Einrichtung, sonst nichts.
 */
export const EINRICHTUNG_META_SCHLUESSEL = "einrichtung_erledigt_am";

export function istEinrichtungErledigt(metadaten: unknown): boolean {
  if (!metadaten || typeof metadaten !== "object") return false;
  const wert = (metadaten as Record<string, unknown>)[EINRICHTUNG_META_SCHLUESSEL];
  return typeof wert === "string" && wert.length > 0;
}

/**
 * Wohin es nach der Einrichtung geht. Ein ?next= wird wie überall durch
 * safeInternalPath geprüft; ohne eines geht es auf die Startseite. Die
 * Einrichtung selbst ist nie ein Ziel — sonst dreht sich die Seite im Kreis.
 */
export function zielNachEinrichtung(next: string | null | undefined): string {
  const ziel = safeInternalPath(next);
  if (!ziel || ziel === EINRICHTUNG_PFAD || ziel.startsWith(`${EINRICHTUNG_PFAD}?`)) return "/";
  return ziel;
}

export interface PassVorschlagQuelle {
  id: string;
  name: string;
  hoeheM: number;
  hatStrecke: boolean;
  folgtMan: boolean;
}

/**
 * Die Pässe, die die Einrichtung zum Folgen anbietet. Zuerst die, zu denen es
 * eine Strecke gibt — dort kann man nach dem Folgen auch gleich hinfahren —,
 * dann nach Höhe. Schon gefolgte stehen mit drin, damit die Auswahl beim
 * Zurückblättern nicht springt.
 */
export function passVorschlaege(paesse: PassVorschlagQuelle[], anzahl = 8): PassVorschlagQuelle[] {
  return [...paesse]
    .sort((a, b) => {
      if (a.hatStrecke !== b.hatStrecke) return a.hatStrecke ? -1 : 1;
      return b.hoeheM - a.hoeheM;
    })
    .slice(0, anzahl);
}
