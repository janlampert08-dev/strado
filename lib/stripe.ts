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

// Der Client wird beim ERSTEN Aufruf gebaut, nicht beim Import.
//
// Vorher stand hier ein `new Stripe(process.env.STRIPE_SECRET_KEY!)` auf
// Modulebene. Das lief nicht nur zur Laufzeit, sondern auch im Build: Next
// sammelt für /api/stripe/webhook die Seitendaten und importiert die Route
// dafür. Ohne gesetzten Schlüssel warf der Konstruktor dabei "Neither
// apiKey nor config.authenticator provided" — ein Fehler, der die Ursache
// nicht nennt und den ganzen Build kippt. Betroffen war jeder Build ohne
// vollständige Secrets: ein Fork, ein frischer Clone, ein CI-Job mit einer
// fehlenden Variable (Audit-Befund A6).
//
// Ein Modul, das beim Import Umgebungsvariablen erzwingt, macht den Build
// von Laufzeit-Konfiguration abhängig. Die Prüfung gehört an die Stelle, an
// der der Schlüssel wirklich gebraucht wird — dort ist sie auch aussagekräftig.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // Bewusst der Variablenname im Klartext und NICHT der Wert — dieselbe
    // Regel wie in lib/actions/billing.ts bei den Preis-IDs: "Stripe nicht
    // konfiguriert" ohne die Variable ist die Meldung, die niemand
    // nachschlagen kann.
    throw new Error("STRIPE_SECRET_KEY ist nicht gesetzt — Stripe-Aufruf nicht möglich.");
  }

  client = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  return client;
}
