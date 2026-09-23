// Was unter einer eigenen, gespeicherten Fahrt als Nächstes angeboten wird —
// höchstens eine Sache (components/NachDerFahrt.tsx). Rein und testbar.

import type { Geraet } from "@/lib/geraet";

export type InstallationsWeg = "knopf" | "ios-anleitung";

/**
 * Ob und wie "Strado auf den Home-Bildschirm" angeboten wird.
 *
 * - Schon installiert (standalone) oder abgelehnt: nicht.
 * - iPhone/iPad: die Anleitung übers Teilen-Menü — Safari bietet keinen
 *   Knopf an, den eine Seite auslösen könnte.
 * - Android: nur mit einem Angebot des Browsers. Fehlt es, ist Strado
 *   entweder schon installiert (Chrome bietet dann nichts mehr an) oder der
 *   Browser kann es nicht; in beiden Fällen wäre eine Anleitung falsch.
 * - Desktop: nicht. Aufgezeichnet wird auf dem Telefon.
 */
export function installationsWeg({
  geraet,
  hatAngebot,
  erledigt,
}: {
  geraet: Geraet;
  hatAngebot: boolean;
  erledigt: boolean;
}): InstallationsWeg | null {
  if (geraet.standalone || erledigt) return null;
  if (geraet.plattform === "ios") return "ios-anleitung";
  if (geraet.plattform === "android" && hatAngebot) return "knopf";
  return null;
}

/**
 * Der eine Premium-Satz unter einer eigenen Fahrt — der, der zu dieser Fahrt
 * passt, statt der ganzen Liste. Jeder Satz nennt einen Vorteil, den es
 * tatsächlich gibt (lib/premiumVorteile.ts ist die Zusage, AGB Ziff. 3.2),
 * und sagt, was man bekäme, nicht was fehlt.
 *
 * - Alle Fotoplätze belegt: genau dort stösst man gerade an die Grenze.
 * - Streckenfahrt: das Wetterfenster derselben Strecke — die nächste Fahrt
 *   dort ist der naheliegende Gedanke nach dieser.
 * - Freie Fahrt: die Auswertung, die mit jeder Fahrt wächst.
 */
export function premiumSatzZurFahrt({
  streckenfahrt,
  fotos,
  maxFotosGratis,
  maxFotosPremium,
}: {
  streckenfahrt: boolean;
  fotos: number;
  maxFotosGratis: number;
  maxFotosPremium: number;
}): string {
  if (fotos >= maxFotosGratis) {
    return `Mit Premium hängst du bis zu ${maxFotosPremium} statt ${maxFotosGratis} Fotos an eine Fahrt`;
  }
  if (streckenfahrt) {
    return "Mit Premium siehst du vor der nächsten Fahrt, an welchen Tagen diese Strecke trocken ist";
  }
  return "Mit Premium siehst du deine Fahrten ausgewertet nach Jahr und Fahrzeug";
}
