import Stripe from "stripe";

// API-Version ausdrücklich gepinnt.
//
// Ohne apiVersion nimmt stripe-node NICHT die im Dashboard hinterlegte
// Standardversion des Kontos — das tat nur v11 und älter. Seit v12 pinnt die
// Bibliothek selbst auf die Version, die zum Zeitpunkt ihres Releases aktuell
// war (stripe.core.js: `props.apiVersion || DEFAULT_API_VERSION`). Die
// Version hing damit an der installierten Paketfassung: ein `npm update`
// hätte sie still verschoben, ohne dass sich eine Zeile Anwendungscode
// ändert.
//
// Der Wert ist nicht frei wählbar: lib/actions/billing.ts liest
// latest_invoice.confirmation_secret, und dieses Feld gibt es erst ab
// 2025-03-31.basil (davor lag das Client-Secret unter
// invoice.payment_intent). Ebenso hängt current_period_end seit Basil an den
// Abo-Positionen statt am Abo selbst — siehe leseAboZustand in
// lib/stripeWebhook.ts. Ein Downgrade unter Basil bricht beides.
//
// Gepinnt wird die Version, auf die das installierte SDK ohnehin schon
// zeigte, damit dieses Pinning nichts am Laufzeitverhalten ändert, sondern
// nur festhält, was bisher zufällig galt.
export const STRIPE_API_VERSION = "2026-08-26.dahlia";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: STRIPE_API_VERSION,
});
