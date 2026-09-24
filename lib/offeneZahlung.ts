// Wann ein Abo als "Zahlung offen" gilt — geteilt von der Kaufsperre in
// lib/actions/billing.ts (kein zweites Abo neben einem, das Stripe noch
// einzieht) und von der Abo-Seite, die solchen Konten den Weg ins
// Kundenportal zeigt.
//
// Zwei Stellen, eine Regel: stünde die Frist nur in billing.ts, sperrte die
// Kasse ein Konto mit dem Satz "aktualisiere dein Zahlungsmittel", während
// die Abo-Seite dasselbe Konto auf die Kaufseite zurückschickt — genau der
// Kreis, aus dem es bisher keinen Ausweg gab.
//
// Rein und ohne Server-Import: lib/premium.ts (Server) und die Tests lesen
// es gleichermassen.

/**
 * Wie lange nach dem Ende der letzten bezahlten Periode ein past_due/unpaid-
 * Abo noch als "zieht ein" gilt. 60 Tage decken das längste
 * Wiederholungsfenster ab, das Stripe anbietet (zwei Monate). Ein älteres
 * Abo wird nicht mehr nachbezahlt und steht einem neuen Kauf nicht im Weg.
 */
export const ZAHLUNG_OFFEN_SPERRT_TAGE = 60;

/**
 * Ist für dieses Abo eine Zahlung offen, die sich über das Kundenportal
 * (neues Zahlungsmittel) noch begleichen lässt?
 *
 * `periodeEndeMs` null (unbekannt) zählt als offen: lieber einmal zu oft der
 * Weg ins Portal als ein Konto, das weder kaufen noch nachzahlen kann.
 */
export function zahlungNochOffen(
  status: string | null | undefined,
  periodeEndeMs: number | null,
  jetzt: number = Date.now(),
): boolean {
  if (status !== "past_due" && status !== "unpaid") return false;
  if (periodeEndeMs === null || Number.isNaN(periodeEndeMs)) return true;
  return periodeEndeMs > jetzt - ZAHLUNG_OFFEN_SPERRT_TAGE * 86_400_000;
}
