// Der leise Hinweis für Bestandskunden mit Monatsabo zum alten Preis: das
// Jahresabo wäre günstiger. Gewechselt wird im Stripe-Kundenportal — eine
// eigene Umstellung gibt es nicht (dieselbe Abwägung wie bei Kündigung und
// Zahlungsmittel, siehe createPortalSession).
//
// Rein und ohne Netz, damit beide Entscheidungen geprüft werden können:
// wie viel die Ersparnis beträgt, und ob das Portal den Wechsel überhaupt
// anbietet. Das zweite ist der wichtigere Teil — ein Hinweis "im
// Kundenportal wechseln", hinter dem das Portal keinen Wechsel kennt, ist
// ein Versprechen, das die Seite nicht halten kann.
import type Stripe from "stripe";

/**
 * Was zwölf Monatszahlungen gegenüber einem Jahresabo mehr kosten, in der
 * kleinsten Einheit. null, wenn das Jahresabo nicht günstiger ist oder die
 * Währungen verschieden sind — dann gibt es keinen ehrlichen Satz.
 */
export function jahresErsparnisRappen(
  monat: { rappen: number; waehrung: string } | null,
  jahr: { rappen: number; waehrung: string } | null,
): number | null {
  if (!monat || !jahr) return null;
  if (monat.waehrung.toLowerCase() !== jahr.waehrung.toLowerCase()) return null;
  const differenz = monat.rappen * 12 - jahr.rappen;
  return differenz > 0 ? differenz : null;
}

/**
 * Bietet diese Portal-Konfiguration den Wechsel auf genau diesen Preis an?
 *
 * Nur wenn subscription_update eingeschaltet ist UND der Jahrespreis unter
 * den erlaubten Produkten/Preisen steht. Stand 2026-09-25 ist
 * subscription_update in der Live-Konfiguration aus — der Hinweis bleibt
 * dann weg, bis der Eigentümer den Wechsel im Dashboard freigibt.
 */
export function portalErlaubtWechselZu(
  konfiguration: Pick<Stripe.BillingPortal.Configuration, "active" | "features"> | null,
  preisId: string | null | undefined,
): boolean {
  if (!konfiguration || !konfiguration.active || !preisId) return false;
  const update = konfiguration.features.subscription_update;
  if (!update.enabled) return false;
  if (!update.default_allowed_updates.includes("price")) return false;
  return (update.products ?? []).some((produkt) => produkt.prices.includes(preisId));
}
