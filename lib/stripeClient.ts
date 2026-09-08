// Lädt Stripe.js im Browser — die einzige Stelle der Anwendung, die das
// tut. Genutzt von components/PremiumCheckoutForm.tsx, dem Payment Element
// auf /profil/premium.
//
// Der Kommentar, der hier stand, erklärte die Datei als Überbleibsel einer
// abgeschalteten Premium-UI. Das stimmt seit dem Livegang nicht mehr: der
// Kaufweg ist Produktionscode (siehe AGENTS.md, "Current State").
//
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ist der einzige Stripe-Wert, der ins
// Client-Bundle gehört. Secret Key, Webhook-Secret und die Preis-IDs
// bleiben serverseitig in lib/stripe.ts und lib/actions/billing.ts.
import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | undefined;

// Einmal geladen, wiederverwendet — loadStripe() selbst cached bereits
// intern, aber ein Modul-Singleton vermeidet unnötige Re-Registrierungen
// bei jedem Render von PremiumCheckoutForm.
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}
