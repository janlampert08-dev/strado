import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { KULANZ_TAGE, leseAboZustand } from "@/lib/stripeWebhook";

// Nachlaufender Abgleich zwischen Stripe und profiles.ist_premium.
//
// Er ist kein Beiwerk der Beobachtbarkeit, sondern Teil der
// Berechtigungslogik: ist_premium ist ein GESPEICHERTER Wert, keine laufende
// Auswertung. Die Bedingung "now() < kulanz_bis" wird nur in dem Moment
// geprüft, in dem jemand die Zeile schreibt. Läuft eine Kulanzfrist ab, ohne
// dass Stripe noch ein Ereignis schickt — und für den blossen Zeitablauf
// schickt Stripe keines —, bliebe Premium sonst dauerhaft bestehen, obwohl
// nie bezahlt wurde.
//
// Zweitens fängt der Lauf verpasste Webhooks ab: bleibt ein Abo lange über
// seinem Periodenende, ohne dass ein Ereignis ankam, wird sein Zustand hier
// frisch von Stripe geholt.

// Abo gilt als überfällig, wenn das Periodenende so weit zurückliegt, dass
// eine Verlängerung längst ein Ereignis erzeugt haben müsste. Ein Tag Puffer
// deckt Zustellverzögerungen und Stripes eigene Wiederholungen ab.
const UEBERFAELLIG_NACH_MS = 24 * 60 * 60 * 1000;

// Obergrenze pro Lauf, damit ein Rückstand die Laufzeit der Function nicht
// sprengt. Der nächste Lauf nimmt den Rest.
const MAX_NACHGEHOLTE_ABOS = 50;

function istBerechtigt(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Ohne gesetztes Secret bleibt der Endpunkt zu, statt offen zu stehen:
  // ein Abgleich, den jeder auslösen kann, ist ein Hebel für Last und für
  // ungewollte Statusänderungen.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!istBerechtigt(req)) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Projektion nachziehen — fängt abgelaufene Kulanzfristen ab.
  const { data: korrigiert, error: abgleichFehler } = await supabase.rpc("premium_abgleich");
  if (abgleichFehler) {
    console.error("premium_abgleich fehlgeschlagen", abgleichFehler);
    return NextResponse.json({ error: "Abgleich fehlgeschlagen" }, { status: 500 });
  }

  // 2. Überfällige Abos frisch von Stripe holen — fängt verpasste Webhooks ab.
  const grenze = new Date(Date.now() - UEBERFAELLIG_NACH_MS).toISOString();
  const { data: ueberfaellig, error: leseFehler } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .in("status", ["active", "trialing", "past_due"])
    .lt("current_period_end", grenze)
    .limit(MAX_NACHGEHOLTE_ABOS);

  if (leseFehler) {
    console.error("Überfällige Abos konnten nicht gelesen werden", leseFehler);
    return NextResponse.json({ error: "Abgleich fehlgeschlagen" }, { status: 500 });
  }

  let nachgeholt = 0;
  let fehlgeschlagen = 0;

  for (const zeile of ueberfaellig ?? []) {
    try {
      const subscription = await stripe.subscriptions.retrieve(zeile.stripe_subscription_id);
      const abgerufenAm = new Date().toISOString();
      const zustand = leseAboZustand(subscription);
      if (!zustand) {
        fehlgeschlagen += 1;
        continue;
      }

      const { error } = await supabase.rpc("apply_subscription_state", {
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

      if (error) throw error;
      nachgeholt += 1;
    } catch (fehler) {
      // Ein einzelnes unerreichbares Abo darf den ganzen Lauf nicht kippen —
      // gezählt und protokolliert, der nächste Lauf versucht es erneut.
      console.error("Abo konnte nicht nachgeholt werden", zeile.stripe_subscription_id, fehler);
      fehlgeschlagen += 1;
    }
  }

  return NextResponse.json({
    korrigiert: korrigiert?.length ?? 0,
    nachgeholt,
    fehlgeschlagen,
  });
}
