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

/**
 * Läuft dieses Abo gerade, im Sinne von "Stripe zieht ein und alles ist
 * bezahlt"? Bewusst eng: `past_due` läuft nicht, auch wenn eine Kulanzfrist
 * den Zugang noch trägt.
 */
export function statusIstLaufend(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/**
 * Trägt eine Kulanzfrist den Zugang dieses Abos gerade — also: Status nicht
 * laufend, aber die Frist noch nicht abgelaufen? Dieselbe Bedingung, die
 * `subscription_ist_premium` (0059) in der Datenbank auswertet, wenn sie
 * `profiles.ist_premium` für ein `past_due`-Abo auf true lässt.
 */
export function inKulanzfristJetzt(
  status: string | null | undefined,
  kulanzBisMs: number | null,
  jetzt: number = Date.now(),
): boolean {
  if (statusIstLaufend(status)) return false;
  if (kulanzBisMs === null || Number.isNaN(kulanzBisMs)) return false;
  return kulanzBisMs > jetzt;
}

/**
 * Hat die Abo-Zeile etwas, das die Person angeht — eine laufende Kulanzfrist
 * oder eine Zahlung, die sie im Portal noch begleichen kann?
 *
 * Wofür das gebraucht wird: `profiles.ist_premium` bleibt in der
 * Kulanzfrist true, `statusIstLaufend("past_due")` ist aber false. Jeder
 * Zweig, der "Premium aktiv, aber kein laufendes Abo" als "dann kommt es
 * woanders her" liest — Saisonpass, Gratis-Premium, von Hand gesetzt —
 * verdeckt sonst genau die Fälle, in denen eine Zahlung offen ist. Wer das
 * fragt, bevor er eine andere Quelle benennt, kann das nicht.
 */
export function aboBrauchtAufmerksamkeit(
  status: string | null | undefined,
  kulanzBisMs: number | null,
  periodeEndeMs: number | null,
  jetzt: number = Date.now(),
): boolean {
  return (
    inKulanzfristJetzt(status, kulanzBisMs, jetzt) ||
    zahlungNochOffen(status, periodeEndeMs, jetzt)
  );
}
