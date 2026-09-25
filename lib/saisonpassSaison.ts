// Wann der Saisonpass ehrlicherweise einen Hinweis braucht.
//
// Der Pass gilt sechs Monate AB KAUF (AGB Ziff. 4.6, SAISONPASS_MONATE).
// Wer ihn Ende September kauft, bekommt Oktober bis März — die Monate, in
// denen die meisten Pässe zu sind. Das endet in Reue und Rückerstattungen
// (Ziff. 7.1), und es ist ein Kauf, zu dem die Kaufseite niemandem hätte
// raten dürfen.
//
// Ein wählbarer Starttermin wäre die elegantere Lösung, widerspricht aber
// dem Wortlaut "sechs Monate ab dem Kauf" — das ist eine AGB-Änderung mit
// 30 Tagen Ankündigung (Ziff. 14.1) und nicht Sache dieser Datei. Bis dahin
// bleibt der Pass kaufbar, und die Kaufseite sagt im Winterhalbjahr offen,
// was er dann bringt, und empfiehlt das Jahresabo.
//
// Rein und ohne Netz, damit es geprüft werden kann (Vitest kennt nur lib/).
// Die Zeitzone ist fest Europe/Zurich: die Serverfunktionen laufen in UTC,
// und in der Nacht auf den 1. Oktober sollen Kaufseite und Kalender der
// Kundschaft dasselbe sagen.

/** Die Monate (1–12), in denen der Hinweis steht: Oktober bis Februar.
 *  Ab März beginnt der Pass mit der Saison, die er bezahlt. */
const WINTERMONATE = new Set([10, 11, 12, 1, 2]);

/** Der Kalendermonat (1–12) in Europe/Zurich. */
export function monatInZuerich(jetzt: Date): number {
  const teil = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", month: "numeric" })
    .formatToParts(jetzt)
    .find((t) => t.type === "month");
  return Number(teil?.value);
}

/**
 * Liegt ein Saisonpass-Kauf jetzt überwiegend im Winter? Dann empfehlen
 * Kaufseite und /premium das Jahresabo und sagen beim Pass dazu, was er
 * jetzt bringt.
 */
export function saisonpassImWinter(jetzt: Date = new Date()): boolean {
  return WINTERMONATE.has(monatInZuerich(jetzt));
}
