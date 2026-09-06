"use server";

// Premium-UI ist vorerst deaktiviert (siehe components/PremiumCard.tsx) —
// diese Actions sind dadurch von keiner Seite mehr aus erreichbar, bleiben
// aber unverändert bestehen, damit Premium später ohne Backend-Änderungen
// reaktiviert werden kann.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { KULANZ_TAGE, leseAboZustand } from "@/lib/stripeWebhook";
import type Stripe from "stripe";

// Ein Customer-Feld kann bei Stripe die ID oder das ausgeklappte Objekt
// sein (auch ein gelöschter Customer). Nur die ID interessiert hier.
function idVonCustomer(customer: Stripe.Subscription["customer"]): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

// Legt bei Bedarf einen Stripe-Customer an (einmalig pro Nutzer) und
// speichert die ID am Profil — sowohl der Webhook als auch confirmSubscription
// (unten) brauchen diese Zuordnung. Liest/schreibt stripe_customer_id über
// den Service-Role-Client statt der eingeloggten Nutzer-Session: die Spalte
// ist seit der RLS-Härtung (siehe Migration 0027) für anon/authenticated
// weder lesbar noch beschreibbar, da sie sonst über einen direkten PostgREST-
// Aufruf beliebig überschreibbar wäre. userId kommt hier ausschliesslich aus
// der bereits über supabase.auth.getUser() verifizierten Session der Aufrufer
// unten — nie aus Nutzereingaben — daher ist der RLS-Bypass hier sicher.
async function getOrCreateStripeCustomerId(
  userId: string,
  email: string | undefined,
): Promise<string> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  await admin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}

export type SubscriptionIntentResult =
  | { ok: true; clientSecret: string; subscriptionId: string }
  | { ok: false; error: string };

// Die wählbaren Pläne. Der Gründerpreis fehlt hier bewusst: er ist an eine
// Mengenregel gebunden (die ersten 100 Abos, siehe docs/premium-plan.md) und
// wird erst zusammen mit der Kaufoberfläche in Phase 3 vergeben — als
// serverseitige Entscheidung, nie als Wahl des Clients.
export type AboPlan = "monat" | "jahr";

// Preis-IDs kommen ausschliesslich aus dieser serverseitigen Zuordnung. Eine
// vom Client übergebene Price-ID würde bedeuten, dass sich jeder seinen
// eigenen Preis aussuchen kann — auch einen fremden oder einen aus einem
// anderen Katalog.
function preisIdFuer(plan: AboPlan): string | undefined {
  switch (plan) {
    case "monat":
      // Fallback auf die alte, einzelne Variable, damit bestehende
      // .env.local-Dateien ohne Anpassung weiterlaufen.
      return process.env.STRIPE_PREMIUM_PRICE_ID_MONAT ?? process.env.STRIPE_PREMIUM_PRICE_ID;
    case "jahr":
      return process.env.STRIPE_PREMIUM_PRICE_ID_JAHR;
  }
}

function clientSecretVon(subscription: Stripe.Subscription): string | null {
  // Seit API-Version 2025-03-31.basil hängt das PaymentIntent-Client-Secret
  // nicht mehr unter invoice.payment_intent, sondern unter
  // invoice.confirmation_secret (siehe das Pinning in lib/stripe.ts).
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice !== "object") return null;
  return invoice.confirmation_secret?.client_secret ?? null;
}

// Erzeugt ein Abo im Status "incomplete" und gibt das zugehörige PaymentIntent-
// Client-Secret zurück — das Payment Element (PremiumCheckoutForm) sammelt
// die Zahlungsdaten direkt eingebettet im eigenen UI, statt zu Stripes
// gehosteter Checkout-Seite umzuleiten.
export async function createSubscriptionIntent(
  plan: AboPlan = "monat",
): Promise<SubscriptionIntentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Bitte melde dich zuerst an." };

  const preisId = preisIdFuer(plan);
  if (!preisId) return { ok: false, error: "Dieser Plan ist zurzeit nicht verfügbar." };

  const customerId = await getOrCreateStripeCustomerId(user.id, user.email);

  // Ohne diese Prüfung legte jeder Aufruf ein neues Abo an: wer die
  // Kaufseite zweimal öffnet oder neu lädt, erzeugte zwei incomplete-Abos —
  // und wer beide bezahlt, zahlt doppelt für dasselbe Konto.
  const vorhandene = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
    expand: ["data.latest_invoice.confirmation_secret"],
  });

  const laeuftBereits = vorhandene.data.find(
    (abo) => abo.status === "active" || abo.status === "trialing",
  );
  if (laeuftBereits) {
    return { ok: false, error: "Du hast bereits ein aktives Premium-Abo." };
  }

  // Ein noch unbezahltes Abo für denselben Plan wiederverwenden, statt
  // daneben ein zweites anzulegen.
  const offen = vorhandene.data.find(
    (abo) =>
      abo.status === "incomplete" &&
      abo.items.data.some((position) => position.price.id === preisId) &&
      clientSecretVon(abo) !== null,
  );
  if (offen) {
    return { ok: true, clientSecret: clientSecretVon(offen)!, subscriptionId: offen.id };
  }

  const subscription = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: preisId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
    },
    {
      // Fängt den Doppelklick ab, bei dem zwei Anfragen die Prüfung oben
      // gleichzeitig passieren: beide bekommen dann dasselbe Abo zurück.
      // Auf eine Stunde begrenzt, damit ein späteres, absichtliches
      // Neuabschliessen nicht auf einer alten Antwort hängen bleibt.
      idempotencyKey: `abo:${user.id}:${plan}:${Math.floor(Date.now() / 3_600_000)}`,
    },
  );

  const clientSecret = clientSecretVon(subscription);
  if (!clientSecret) {
    return { ok: false, error: "Zahlung konnte nicht vorbereitet werden." };
  }

  return { ok: true, clientSecret, subscriptionId: subscription.id };
}

// Nach erfolgreicher Bestätigung des Payment Elements im Browser (kein
// Redirect nötig) wird der Abo-Status direkt bei Stripe verifiziert, statt
// sich allein auf das Webhook-Event zu verlassen (siehe Begründung in der
// vorherigen Checkout-Variante — funktioniert unabhängig davon, ob Stripe
// diese lokale Dev-Umgebung per Webhook erreichen kann).
export async function confirmSubscription(subscriptionId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Wie oben: stripe_customer_id/ist_premium sind für anon/authenticated
  // weder lesbar noch beschreibbar (Migration 0027) — der Service-Role-Client
  // ist hier sicher, weil user.id aus der bereits verifizierten Session
  // stammt und der Premium-Status erst nach der Stripe-Verifikation unten
  // gesetzt wird, nicht anhand von Client-Eingaben.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) return false;

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice"],
    });
  } catch {
    return false;
  }
  const abgerufenAm = new Date().toISOString();

  // Kein Gratis-Testzeitraum konfiguriert — "trialing" hier bewusst NICHT
  // akzeptiert (im Gegensatz zum Webhook-Handler, der auch künftige
  // Trial-Konfigurationen abdecken soll). "active" allein reicht aus, aber
  // zusätzlich prüfen wir, dass die zugehörige Rechnung tatsächlich bezahlt
  // wurde, statt uns allein auf das Subscription-Status-Feld zu verlassen.
  if (subscription.status !== "active") return false;
  // Das Abo muss dem eigenen Customer gehören: subscriptionId kommt aus dem
  // Browser, ist also eine Nutzereingabe. Ohne diese Prüfung liesse sich mit
  // einer fremden Abo-ID Premium für das eigene Konto einschalten.
  if (idVonCustomer(subscription.customer) !== profile.stripe_customer_id) return false;

  const invoice = subscription.latest_invoice;
  const invoicePaid = invoice && typeof invoice === "object" && invoice.status === "paid";
  if (!invoicePaid) return false;

  // Beide Zustände gemeinsam schreiben. Früher setzte diese Stelle nur
  // profiles.ist_premium — Premium war damit sofort aktiv, während es zu dem
  // Abo keine Zeile in subscriptions gab und die Anwendung weder Plan noch
  // Periodenende noch Kulanzfrist kannte. apply_subscription_state erledigt
  // beides in einer Transaktion (0059_premium_abo_zustand.sql).
  const zustand = leseAboZustand(subscription);
  if (!zustand) return false;

  const { data: angewendet, error } = await admin.rpc("apply_subscription_state", {
    p_stripe_customer_id: zustand.stripeCustomerId,
    p_stripe_subscription_id: zustand.stripeSubscriptionId,
    p_status: zustand.status,
    p_price_id: zustand.priceId,
    p_current_period_end: zustand.currentPeriodEnd,
    p_cancel_at_period_end: zustand.cancelAtPeriodEnd,
    p_stripe_fetched_at: abgerufenAm,
    p_kulanz_aktion: "unveraendert",
    p_kulanz_invoice_id: null,
    p_kulanz_tage: KULANZ_TAGE,
  });

  if (error) return false;
  // false heisst hier: der Webhook war schneller und hat bereits einen
  // neueren Zustand geschrieben. Das Abo ist bezahlt und verifiziert, der
  // Kauf gilt also trotzdem als erfolgreich.
  if (angewendet === false) return true;

  revalidatePath("/profil");
  revalidatePath("/profil/einstellungen");
  return true;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// Stripes gehostetes Kundenportal — dort verwaltet/kündigt der Nutzer sein
// Abo selbst, keine eigene UI dafür nötig (im Gegensatz zum Checkout selbst
// lohnt sich der Aufwand einer eigenen Portal-Nachbildung nicht).
export async function createPortalSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/anmelden");

  // Wie oben: stripe_customer_id ist für anon/authenticated nicht mehr lesbar
  // (Migration 0027).
  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) redirect("/profil");

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${siteUrl()}/profil`,
  });

  redirect(session.url);
}
