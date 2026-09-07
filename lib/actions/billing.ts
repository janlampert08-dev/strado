"use server";

// Abschluss, Bestätigung und Verwaltung des Premium-Abos. Aufgerufen aus
// components/PremiumCheckoutForm.tsx (Kauf), components/PremiumCard.tsx
// (Kundenportal) und app/profil/premium/page.tsx (Angebot).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { KULANZ_TAGE, leseAboZustand } from "@/lib/stripeWebhook";
import {
  GRUENDER_PLAETZE,
  type AboPlan,
  type PlanAngebot,
  type PremiumAngebot,
  type VergebenerPreis,
} from "@/lib/premiumLimits";
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
  | {
      ok: true;
      clientSecret: string;
      subscriptionId: string;
      /** Der Preis, der für dieses Abo tatsächlich gilt — nicht der, den die
       *  Kaufseite beim Rendern gezeigt hat. Siehe VergebenerPreis. */
      preis: VergebenerPreis;
    }
  | { ok: false; error: string };

// AboPlan, GRUENDER_PLAETZE und die Angebots-Typen stehen in
// lib/premiumLimits.ts, nicht hier: eine Datei mit "use server" darf
// ausschliesslich async Functions exportieren. Eine exportierte Zahl lässt
// die Client-Reference-Transformation das Modul als "hat gar keine Exporte"
// behandeln, und der Build bricht mit einer Meldung ab, die auf den
// Importeur statt auf die Ursache zeigt. Dieselbe Falle steht in
// lib/constants.ts für REPORT_REASONS beschrieben.
function monatsPreisId(): string | undefined {
  // Fallback auf die alte, einzelne Variable, damit bestehende
  // .env.local-Dateien ohne Anpassung weiterlaufen.
  return process.env.STRIPE_PREMIUM_PRICE_ID_MONAT ?? process.env.STRIPE_PREMIUM_PRICE_ID;
}

// Preis-IDs kommen ausschliesslich aus dieser serverseitigen Zuordnung. Eine
// vom Client übergebene Price-ID würde bedeuten, dass sich jeder seinen
// eigenen Preis aussuchen kann — auch einen fremden oder einen aus einem
// anderen Katalog.
//
// Beim Jahresplan wird hier zugleich ein Gründerplatz RESERVIERT. Bewusst
// ein Schreibvorgang und keine blosse Abfrage: nur so ist "die ersten 100"
// gegen zwei gleichzeitige Käufe dicht (Advisory Lock in
// gruenderplatz_beanspruchen).
//
// Reserviert, nicht verbraucht — der Unterschied ist der Punkt von Migration
// 0066. Die Reservierung läuft von selbst ab; endgültig wird der Platz erst
// mit der verifizierten Zahlung (gruenderplatz_bestaetigen, aufgerufen aus
// confirmSubscription und aus dem Webhook). Sonst hätten hundert abgebrochene
// Checkouts die Zusage aus AGB Ziff. 4.3 aufgebraucht, ohne dass ein einziges
// Abo zustande kam.
//
// Gibt den vergebenen Preis mit zurück, nicht nur die ID: der Aufrufer muss
// dem Client sagen können, was tatsächlich abgebucht wird.
async function preisIdFuer(
  plan: AboPlan,
  userId: string,
): Promise<{ preisId: string | undefined; istGruenderpreis: boolean }> {
  if (plan === "monat") return { preisId: monatsPreisId(), istGruenderpreis: false };

  const gruenderPreisId = process.env.STRIPE_PREMIUM_PRICE_ID_GRUENDER;
  if (gruenderPreisId) {
    const { data: hatPlatz, error } = await createAdminClient().rpc("gruenderplatz_beanspruchen", {
      p_user_id: userId,
      p_maximum: GRUENDER_PLAETZE,
      p_reservierung_minuten: GRUENDER_RESERVIERUNG_MINUTEN,
    });
    // Bei einem Fehler NICHT den Gründerpreis vergeben: im Zweifel den
    // regulären Preis nehmen. Andersherum verschenkte ein Datenbankausfall
    // beliebig viele vergünstigte Jahresabos.
    if (!error && hatPlatz === true) {
      return { preisId: gruenderPreisId, istGruenderpreis: true };
    }
  }

  return { preisId: process.env.STRIPE_PREMIUM_PRICE_ID_JAHR, istGruenderpreis: false };
}

// Wie lange eine Reservierung gilt: 24 Stunden (Migration 0069).
//
// Massgeblich ist nicht, wie lange ein Checkout dauert, sondern wie lange
// Stripe die Zahlung noch annimmt. Der Gründerpreis steht fest, sobald das
// Abo angelegt ist; ein Abo im Status `incomplete` bleibt danach rund 23
// Stunden bezahlbar. Mit der früheren Stunde konnte die Reservierung ablaufen,
// jemand anders den letzten Platz nehmen — und die erste Zahlung trotzdem noch
// zum Gründerpreis durchgehen. Dann zahlen 101 Leute den Preis für 100 Plätze.
//
// Die Frist endet jetzt erst, wenn Stripe das Abo selbst aufgegeben hat und
// keine Abbuchung mehr kommen kann. Kostet: ein abgebrochener Versuch
// blockiert den Platz einen Tag statt eine Stunde.
const GRUENDER_RESERVIERUNG_MINUTEN = 24 * 60;

// Macht aus der Reservierung einen dauerhaften Platz — aber nur, wenn das
// bezahlte Abo wirklich auf dem Gründerpreis läuft. Ein Monats- oder
// regulärer Jahresabschluss darf keinen Platz verbrauchen.
//
// Exportiert wird das NICHT: der Aufruf gehört ausschliesslich hinter eine
// bei Stripe verifizierte Zahlung.
async function gruenderplatzBestaetigen(preisId: string, userId: string): Promise<void> {
  if (!preisId || preisId !== process.env.STRIPE_PREMIUM_PRICE_ID_GRUENDER) return;
  const { error } = await createAdminClient().rpc("gruenderplatz_bestaetigen", {
    p_user_id: userId,
  });
  if (error) console.error("Gründerplatz konnte nicht bestätigt werden", { userId }, error);
}

// Preise kommen aus Stripe, nicht aus einer zweiten Liste im Code — eine im
// Dashboard geänderte Zahl darf nicht stillschweigend von einer
// hartcodierten abweichen, sonst bewirbt die Seite einen Preis, der beim
// Abbuchen ein anderer ist (Preisbekanntgabeverordnung und, schlichter,
// Vertrauen).
async function betrag(preisId: string | undefined): Promise<{ rappen: number; waehrung: string } | null> {
  if (!preisId) return null;
  try {
    const preis = await stripe.prices.retrieve(preisId);
    if (typeof preis.unit_amount !== "number") return null;
    return { rappen: preis.unit_amount, waehrung: preis.currency };
  } catch {
    return null;
  }
}

// Nur lesend — beansprucht ausdrücklich KEINEN Gründerplatz. Die Kaufseite
// darf beliebig oft geöffnet werden, ohne Plätze zu verbrennen; vergeben
// wird erst beim tatsächlichen Anlegen des Abos.
export async function getPremiumAngebot(): Promise<PremiumAngebot> {
  const frei = await createAdminClient().rpc("gruenderplaetze_frei", {
    p_maximum: GRUENDER_PLAETZE,
  });
  const gruenderPlaetzeFrei = typeof frei.data === "number" ? frei.data : 0;

  const gruenderVerfuegbar = Boolean(process.env.STRIPE_PREMIUM_PRICE_ID_GRUENDER) && gruenderPlaetzeFrei > 0;

  const [monat, jahrRegulaer, jahrGruender] = await Promise.all([
    betrag(monatsPreisId()),
    betrag(process.env.STRIPE_PREMIUM_PRICE_ID_JAHR),
    gruenderVerfuegbar ? betrag(process.env.STRIPE_PREMIUM_PRICE_ID_GRUENDER) : Promise.resolve(null),
  ]);

  const plaene: PlanAngebot[] = [];
  if (monat) {
    plaene.push({
      plan: "monat",
      betragRappen: monat.rappen,
      waehrung: monat.waehrung,
      istGruenderpreis: false,
      regulaerRappen: null,
    });
  }
  if (jahrGruender && jahrRegulaer) {
    plaene.push({
      plan: "jahr",
      betragRappen: jahrGruender.rappen,
      waehrung: jahrGruender.waehrung,
      istGruenderpreis: true,
      regulaerRappen: jahrRegulaer.rappen,
    });
  } else if (jahrRegulaer) {
    plaene.push({
      plan: "jahr",
      betragRappen: jahrRegulaer.rappen,
      waehrung: jahrRegulaer.waehrung,
      istGruenderpreis: false,
      regulaerRappen: null,
    });
  }

  return { plaene, gruenderPlaetzeFrei };
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

  // Nur die beiden bekannten Werte. Kommt etwas anderes an, ist es keine
  // Auswahl aus der Oberfläche, sondern ein selbst gebauter Aufruf.
  if (plan !== "monat" && plan !== "jahr") {
    return { ok: false, error: "Unbekannter Plan." };
  }

  const customerId = await getOrCreateStripeCustomerId(user.id, user.email);

  // Ohne diese Prüfung legte jeder Aufruf ein neues Abo an: wer die
  // Kaufseite zweimal öffnet oder neu lädt, erzeugte zwei incomplete-Abos —
  // und wer beide bezahlt, zahlt doppelt für dasselbe Konto.
  //
  // Gezielt nach Status abfragen statt status "all" mit einer Seitengrenze:
  // ein Konto mit vielen beendeten Abos hätte sonst genau das laufende aus
  // der ersten Seite verdrängt, und daneben wäre ein zweites entstanden.
  const [aktive, testphase, unbezahlte] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 }),
    stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 1 }),
    stripe.subscriptions.list({
      customer: customerId,
      status: "incomplete",
      limit: 20,
      expand: ["data.latest_invoice.confirmation_secret"],
    }),
  ]);

  if (aktive.data.length > 0 || testphase.data.length > 0) {
    return { ok: false, error: "Du hast bereits ein aktives Premium-Abo." };
  }

  // Erst hier die Preis-ID bestimmen, nicht weiter oben: beim Jahresplan
  // beansprucht das einen Gründerplatz, und den soll niemand verbrauchen,
  // der ohnehin schon ein laufendes Abo hat und gleich abgewiesen wird.
  const { preisId, istGruenderpreis } = await preisIdFuer(plan, user.id);
  if (!preisId) return { ok: false, error: "Dieser Plan ist zurzeit nicht verfügbar." };

  // Den tatsächlich geltenden Betrag mitliefern. Ohne ihn bestätigt jemand
  // eine Zahlung über die Zahl, die beim Öffnen der Seite galt — und wenn
  // der letzte Gründerplatz zwischenzeitlich weg war, ist das die falsche.
  const vergeben = await betrag(preisId);
  const preis: VergebenerPreis = {
    betragRappen: vergeben?.rappen ?? 0,
    waehrung: vergeben?.waehrung ?? "chf",
    istGruenderpreis,
  };

  // Ein noch unbezahltes Abo für denselben Plan wiederverwenden, statt
  // daneben ein zweites anzulegen.
  const offen = unbezahlte.data.find(
    (abo) =>
      abo.items.data.some((position) => position.price.id === preisId) &&
      clientSecretVon(abo) !== null,
  );
  if (offen) {
    return { ok: true, clientSecret: clientSecretVon(offen)!, subscriptionId: offen.id, preis };
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

  return { ok: true, clientSecret, subscriptionId: subscription.id, preis };
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

  // Jetzt ist die Zahlung bei Stripe verifiziert — erst hier wird aus der
  // Reservierung ein dauerhafter Gründerplatz (Migration 0066). Vorher
  // hätte ein abgebrochener Checkout den Platz behalten.
  //
  // Idempotent und bewusst ohne Fehlerbehandlung nach aussen: der Kauf ist
  // an dieser Stelle gelungen, und ihn wegen des Verzeichniseintrags
  // scheitern zu lassen wäre für die zahlende Person das schlechtere
  // Ergebnis.
  //
  // Dass der Eintrag verloren geht, fängt der Webhook auf — er ruft dieselbe
  // Bestätigung und wird von Stripe wiederholt, bis sie durchläuft
  // (app/api/stripe/webhook/route.ts wirft dafür bewusst). Dieser Weg hier
  // ist der schnelle, jener der verlässliche.
  await gruenderplatzBestaetigen(zustand.priceId, user.id);

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
