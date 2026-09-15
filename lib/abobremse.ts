// Die Mengenbremsen der Abo-Aktionen (lib/actions/billing.ts) und der
// Wiederhol-Takt, gegen den sie bemessen sind.
//
// Bewusst hier und nicht in billing.ts: eine Datei mit der
// "use server"-Direktive darf laut Next.js/React nur async Functions
// exportieren — eine Konstante liesse sich dort weder exportieren noch
// testen. Dieselbe Aufteilung wie bei lib/stripeWebhook.ts, lib/siteUrl.ts
// und REPORT_REASONS in lib/constants.ts.
//
// Dass beides in EINER Datei steht, ist der eigentliche Zweck: Limit und
// Takt gehören zusammen. Wer den Takt enger stellt, verschiebt damit den
// schlimmsten ehrlichen Fall — und der Test daneben schlägt an, sobald er
// dem Limit zu nahe kommt.

/**
 * Wartezeiten zwischen den automatischen Nachfragen nach einer Rückkehr von
 * einer Weiterleitungs-Zahlungsart (TWINT, Bankverfahren). Die Session steht
 * dort unmittelbar nach der Rückkehr noch nicht auf complete/paid.
 *
 * Wachsende Abstände statt eines engen Takts: jeder Versuch kostet einen
 * Stripe-Aufruf, und nach gut einer halben Minute ist ein weiterer Versuch
 * keine Frage der Geduld mehr, sondern eine Frage an den Webhook.
 */
export const WARTEZEITEN_MS = [0, 1_500, 2_500, 4_000, 6_000, 8_000, 10_000] as const;

/**
 * "Erneut prüfen" fragt genau einmal nach, statt die ganze Leiter noch einmal
 * zu durchlaufen.
 *
 * Sonst kostete jeder Tastendruck sieben weitere Stripe-Aufrufe samt
 * Schreibvorgang — auf einem Pfad, den jede angemeldete Person beliebig oft
 * auslösen kann. Wer nach der automatischen Runde noch wartet, wartet auf den
 * Webhook, nicht auf eine achte Nachfrage.
 */
export const EINZELVERSUCH = [0] as const;

/**
 * Wie oft eine Person, die gerade ehrlich bezahlt hat, im schlimmsten Fall
 * bestätigen lässt: die volle automatische Leiter, dazu grosszügig gerechnet
 * ein paarmal neu geladen und ein paarmal "erneut prüfen" geklickt.
 *
 * Diese Zahl ist die Messlatte für CHECKOUT_BESTAETIGEN_LIMIT — nicht eine
 * Schätzung im Kopf dessen, der das Limit setzt.
 */
export const BESTAETIGEN_SCHLIMMSTER_EHRLICHER_FALL =
  WARTEZEITEN_MS.length * 3 + EINZELVERSUCH.length * 5;

/** Anlegen: Checkout-Session und Kundenportal. Noch ist kein Geld geflossen. */
export const CHECKOUT_ANLEGEN_LIMIT = 10;
export const CHECKOUT_ANLEGEN_FENSTER_MS = 5 * 60_000;

/**
 * Bestätigen: hier ist das Geld bereits abgebucht, ein Fehlalarm hiesse
 * "bezahlt, aber kein Premium". Deshalb um ein Vielfaches über dem
 * schlimmsten ehrlichen Fall — es soll eine Schleife um Grössenordnungen
 * bremsen und dabei niemanden treffen, der gerade bezahlt hat.
 */
export const CHECKOUT_BESTAETIGEN_LIMIT = 200;
export const CHECKOUT_BESTAETIGEN_FENSTER_MS = 5 * 60_000;
