// Rechnende und formatierende Anteile der Kaufseite: Beträge ausschreiben,
// den Jahrespreis auf einen Monat herunterbrechen und den Vorteil gegenüber
// zwölf Monatszahlungen beziffern.
//
// Warum in lib/ und nicht in der Komponente: Vitest läuft mit
// environment: "node", jeder Test liegt unter lib/ (AGENTS.md) — Logik, die
// in einer Komponente steht, ist in diesem Projekt schlicht nicht prüfbar.
// Und die Zahlen hier sind keine Kosmetik: "34 % günstiger" ist eine
// Preisaussage auf einer Kaufseite und muss zum tatsächlich abgebuchten
// Betrag passen.
//
// Alle Beträge sind Rappen (bzw. die kleinste Einheit der jeweiligen
// Währung), genau wie Stripe sie führt. Gerechnet wird ausschliesslich mit
// dem, was getPremiumAngebot() aus Stripe gelesen hat — nie mit einer
// zweiten Preisliste im Code.
import type { PlanAngebot } from "./premiumLimits";

/**
 * Schreibt einen Betrag in der kleinsten Einheit als Währungsbetrag aus.
 *
 * Wie viele kleinste Einheiten auf eine ganze gehen, ist nicht überall 100:
 * der Yen kennt keine Nachkommastelle, der Bahrain-Dinar drei. Eine fest
 * verdrahtete 100 zeigte für einen Stripe-Preis in JPY den hundertsten Teil
 * des Betrags an — auf einer Kaufseite ein falsch ausgezeichneter Preis.
 * Der Teiler kommt deshalb aus derselben Locale-Datenbank, die den Betrag
 * gleich darauf formatiert; für CHF ist das unverändert 100.
 */
export function betragText(betrag: number, waehrung: string): string {
  const format = new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: waehrung.toUpperCase(),
  });
  // ?? 2, weil die Typdefinition die Angabe als optional führt. Praktisch
  // liefert jede Laufzeit mit vollständigen Locale-Daten sie; bleibt sie
  // einmal aus, ist der Zweistellen-Fall der richtige Rückfall — er trifft
  // CHF, die einzige Währung, in der Cornice heute Preise führt.
  const stellen = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(betrag / 10 ** stellen);
}

/**
 * Der Jahresbetrag auf einen Monat gerechnet — die Zahl, die den Jahresplan
 * mit dem Monatsplan vergleichbar macht. Bewusst gerundet und nur als
 * Nebenzeile ("entspricht …") ausgewiesen: abgebucht wird der Jahresbetrag,
 * nicht dieser Wert.
 */
export function monatsAequivalentRappen(jahresBetragRappen: number): number {
  return Math.round(jahresBetragRappen / 12);
}

/**
 * Wie viel Prozent der Jahresplan gegenüber zwölf Monatszahlungen spart.
 *
 * null, sobald die Aussage nicht sicher stimmt: fehlender Plan, verschiedene
 * Währungen (ein Vergleich über Währungsgrenzen wäre eine erfundene Zahl)
 * oder ein Jahrespreis, der gar nicht günstiger ist. Die Kaufseite zeigt das
 * Abzeichen dann einfach nicht, statt eine Ersparnis zu behaupten.
 */
export function jahresVorteilProzent(
  monat: PlanAngebot | undefined,
  jahr: PlanAngebot | undefined,
): number | null {
  if (!monat || !jahr) return null;
  if (monat.waehrung.toUpperCase() !== jahr.waehrung.toUpperCase()) return null;
  const zwoelfMonate = monat.betragRappen * 12;
  if (zwoelfMonate <= 0 || jahr.betragRappen >= zwoelfMonate) return null;
  return Math.round((1 - jahr.betragRappen / zwoelfMonate) * 100);
}
