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

export function betragText(rappen: number, waehrung: string): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: waehrung.toUpperCase(),
  }).format(rappen / 100);
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
