import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ereignisAbschliessen,
  ereignisBeanspruchen,
  ereignisFreigeben,
  kulanzAktionFuer,
  KULANZ_TAGE,
  leseAboIdAusRechnung,
  leseAboZustand,
  type KulanzAktion,
} from "@/lib/stripeWebhook";

// Kein eingeloggter Supabase-Nutzer hier (Server-zu-Server-Aufruf von
// Stripe) — die Signaturprüfung unten (constructEvent) ist die eigentliche
// Authentifizierung dieses Requests. Erst danach wird überhaupt etwas
// geschrieben, und zwar über den Service-Role-Client (RLS-Bypass, aber nur
// serverseitig und nur über diesen bereits verifizierten Request
// erreichbar).

type AdminClient = ReturnType<typeof createAdminClient>;

// Holt den Abo-Zustand frisch von Stripe, statt der Ereignis-Nutzlast zu
// vertrauen. Stripe garantiert keine Zustellreihenfolge: ein spät
// zugestelltes "updated" könnte sonst ein bereits verarbeitetes "deleted"
// überschreiben und Premium wieder einschalten. Der frisch geholte Zustand
// ist dagegen immer der aktuelle, egal welches Ereignis ihn ausgelöst hat.
async function schreibeAboZustand(
  supabase: AdminClient,
  subscriptionId: string,
  kulanzAktion: KulanzAktion,
  kulanzInvoiceId: string | null,
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  // Zeitpunkt NACH dem Abruf: apply_subscription_state verwirft damit einen
  // Schreibvorgang, dessen Zustand älter ist als der bereits gespeicherte.
  const abgerufenAm = new Date().toISOString();

  const zustand = leseAboZustand(subscription);
  if (!zustand) {
    throw new Error(`Abo ${subscriptionId} ohne Customer oder Preis — nicht zuordenbar`);
  }

  const { data, error } = await supabase.rpc("apply_subscription_state", {
    p_stripe_customer_id: zustand.stripeCustomerId,
    p_stripe_subscription_id: zustand.stripeSubscriptionId,
    p_status: zustand.status,
    p_price_id: zustand.priceId,
    p_current_period_end: zustand.currentPeriodEnd,
    p_cancel_at_period_end: zustand.cancelAtPeriodEnd,
    p_stripe_fetched_at: abgerufenAm,
    p_kulanz_aktion: kulanzAktion,
    p_kulanz_invoice_id: kulanzInvoiceId,
    p_kulanz_tage: KULANZ_TAGE,
  });

  if (error) throw error;

  // Gründerplatz endgültig machen, sobald das Abo läuft. Der zweite von zwei
  // Wegen — der erste ist confirmSubscription (lib/actions/billing.ts).
  //
  // Beide sind nötig, keiner allein reicht: bei einer Weiterleitungs-
  // Zahlungsart wie TWINT kann der Nutzer die Rückkehr abbrechen, dann kommt
  // nur der Webhook an. Umgekehrt kann der Webhook verzögert eintreffen,
  // während der Nutzer schon zurück ist. gruenderplatz_bestaetigen ist
  // idempotent, ein doppelter Aufruf ändert nichts.
  //
  // Der Preisvergleich hält Monats- und reguläre Jahresabos heraus: nur ein
  // Abo auf dem Gründerpreis darf einen Platz verbrauchen.
  const gruenderPreisId = process.env.STRIPE_PREMIUM_PRICE_ID_GRUENDER;
  if (
    gruenderPreisId &&
    zustand.priceId === gruenderPreisId &&
    (zustand.status === "active" || zustand.status === "trialing")
  ) {
    const { error: platzFehler } = await supabase.rpc("gruenderplatz_bestaetigen_fuer_customer", {
      p_stripe_customer_id: zustand.stripeCustomerId,
    });
    if (platzFehler) {
      console.error("Gründerplatz konnte nicht bestätigt werden", { subscriptionId }, platzFehler);
    }
  }

  // false heisst: kein Profil zu diesem Customer (gelöschtes Konto) oder ein
  // neuerer Zustand war bereits gespeichert. Beides ist kein Fehler, aber
  // beim gelöschten Konto einen Blick wert.
  if (data === false) {
    console.info("apply_subscription_state hat nichts geschrieben", { subscriptionId });
  }
}

// Welche Abo-ID betrifft dieses Ereignis? Abo-Ereignisse tragen sie direkt,
// Rechnungs-Ereignisse über parent.subscription_details.
function betroffenesAbo(event: Stripe.Event): { id: string; invoiceId: string | null } | null {
  if (event.type.startsWith("customer.subscription.")) {
    const subscription = event.data.object as Stripe.Subscription;
    return { id: subscription.id, invoiceId: null };
  }

  if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;
    const aboId = leseAboIdAusRechnung(invoice);
    // Rechnungen ohne Abo (einmalige Zahlungen) gehen Premium nichts an.
    if (!aboId) return null;
    return { id: aboId, invoiceId: invoice.id ?? null };
  }

  return null;
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const anspruch = await ereignisBeanspruchen(supabase, event.id, event.type);
  if (anspruch.art === "erledigt") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (anspruch.art === "in_arbeit") {
    // Ein anderer Aufruf hält den Anspruch gerade. Nicht doppelt ausführen —
    // aber auch nicht mit 200 quittieren: von hier aus ist nicht
    // unterscheidbar, ob dort wirklich noch jemand arbeitet oder ob ein
    // gestorbener Aufruf den Anspruch nicht mehr freigeben konnte. Ein 200
    // wäre für Stripe eine Bestätigung und würde die Zustellung beenden,
    // obwohl der Seiteneffekt womöglich nie lief.
    //
    // 503 lässt Stripe es später erneut versuchen. Ist der andere Aufruf bis
    // dahin fertig, sieht die Wiederholung 'erledigt' und quittiert sauber;
    // ist er gestorben, ist der Anspruch inzwischen verfallen und wird
    // übernommen. Der Preis sind ein paar zusätzliche Zustellversuche bei
    // echter Gleichzeitigkeit — deutlich billiger als ein verlorenes Abo.
    return NextResponse.json({ error: "Ereignis wird bereits verarbeitet" }, { status: 503 });
  }

  try {
    // checkout.session.completed wird vom heutigen Payment-Element-Fluss
    // nicht mehr erzeugt, bleibt aber vorerst stehen: Stripe wiederholt
    // automatisch bis zu drei Tage, von Hand bis zu 15 (Dashboard) bzw. 30
    // Tage (CLI). Ein entfernter Zweig würde eine solche Zustellung nur als
    // erledigt markieren, ohne Premium zu setzen. Erst entfernen, wenn seit
    // dem letzten möglichen Alt-Ereignis 30 Tage vergangen sind.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const aboId = typeof session.subscription === "string" ? session.subscription : null;
      if (session.mode === "subscription" && aboId) {
        await schreibeAboZustand(supabase, aboId, "unveraendert", null);
      }
    } else {
      const kulanzAktion = kulanzAktionFuer(event.type);
      const abo = kulanzAktion ? betroffenesAbo(event) : null;
      if (kulanzAktion && abo) {
        await schreibeAboZustand(supabase, abo.id, kulanzAktion, abo.invoiceId);
      }
    }

    await ereignisAbschliessen(supabase, event.id);
    return NextResponse.json({ received: true });
  } catch (fehler) {
    // Bewusst 500 statt 200: nur so wiederholt Stripe die Zustellung. Die
    // frühere Fassung loggte den Fehler und meldete Erfolg — der Ausfall
    // blieb dadurch dauerhaft und unsichtbar.
    console.error("Stripe-Webhook fehlgeschlagen", { eventId: event.id, type: event.type }, fehler);
    await ereignisFreigeben(supabase, event.id);
    return NextResponse.json({ error: "Verarbeitung fehlgeschlagen" }, { status: 500 });
  }
}
