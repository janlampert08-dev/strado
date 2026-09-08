// Reine Umformungen und Prüfungen rund um eine Stripe-Checkout-Session.
//
// Warum hier und nicht in lib/actions/billing.ts: eine Datei mit "use server"
// darf ausschliesslich async Functions exportieren, ist also nicht
// prüfbar — und Vitest läuft in diesem Projekt nur über lib/ (AGENTS.md).
// Genauso ist leseAboZustand aus dem Webhook-Handler herausgezogen: der
// Zustandsübergang ist ohne Netz und ohne Datenbank testbar, der Aufrufer
// verdrahtet nur noch Abruf und Schreibvorgang.
//
// Was hier steht, entscheidet, ob jemand Premium bekommt. Die Session-ID
// kommt aus dem Browser bzw. aus der Adresszeile und ist damit eine
// Nutzereingabe — die Bindung an den eigenen Customer ist die Prüfung, die
// "Premium mit einer fremden Session-ID einschalten" verhindert.
import Stripe from "stripe";
import type { VergebenerPreis } from "./premiumLimits";

function idVon(feld: string | { id: string } | null | undefined): string | null {
  if (!feld) return null;
  return typeof feld === "string" ? feld : feld.id;
}

/**
 * Der Betrag, den genau diese Session einziehen wird.
 *
 * Er kommt aus der Session selbst und nicht aus einer zweiten Abfrage des
 * Preises: was Stripe abbucht, steht in amount_total, und nur diese Zahl
 * darf auf der Schaltfläche stehen, die die Zahlungspflicht auslöst.
 * null heisst "hier steht kein Betrag" — der Aufrufer entscheidet, ob er
 * auf den Katalogpreis zurückfällt oder abbricht.
 */
export function preisVonSession(session: Stripe.Checkout.Session): VergebenerPreis | null {
  if (typeof session.amount_total !== "number" || !session.currency) return null;
  return { betragRappen: session.amount_total, waehrung: session.currency };
}

/**
 * Eine noch offene Session für denselben Preis, die wiederverwendet werden
 * kann — statt daneben eine zweite anzulegen.
 *
 * Ohne diese Wiederverwendung legte jeder Aufruf eine neue Session an: wer
 * die Kaufseite zweimal öffnet oder neu lädt, erzeugte zwei offene Sessions,
 * und wer beide bezahlt, zahlt doppelt für dasselbe Konto.
 *
 * Verglichen wird gegen die in den Metadaten mitgeschriebene Preis-ID: die
 * Positionen einer Session kommen erst mit einem expand mit, und die
 * Metadaten sind ohnehin der Weg, eine Session im Dashboard einem Plan
 * zuzuordnen. Eine Session ohne Betrag zählt nicht als brauchbar — siehe
 * preisVonSession.
 */
export function passendeOffeneSession(
  sessions: Stripe.Checkout.Session[],
  preisId: string,
): Stripe.Checkout.Session | null {
  return (
    sessions.find(
      (session) =>
        session.mode === "subscription" &&
        session.ui_mode === "elements" &&
        session.metadata?.price_id === preisId &&
        Boolean(session.client_secret) &&
        preisVonSession(session) !== null,
    ) ?? null
  );
}

/**
 * Gehört diese Session dem eigenen Konto, und ist sie tatsächlich bezahlt?
 *
 * Der Session-Status allein reicht nicht: "complete" sagt, dass der Ablauf
 * durch ist, nicht dass Geld geflossen ist. payment_status ist die Zusage
 * darüber. "no_payment_required" wird bewusst NICHT akzeptiert — Strado
 * konfiguriert keinen Gratis-Zeitraum, ein solcher Fall wäre hier
 * unerwartet.
 */
export function istEigeneBezahlteSession(
  session: Stripe.Checkout.Session,
  eigenerCustomerId: string,
): boolean {
  if (idVon(session.customer) !== eigenerCustomerId) return false;
  if (session.mode !== "subscription") return false;
  if (session.status !== "complete") return false;
  return session.payment_status === "paid";
}

/**
 * Ein Stripe-Fehler vom Typ "unbekannter Customer" — z.B. weil
 * profiles.stripe_customer_id noch eine Test-Konto-ID trägt, während der
 * Server inzwischen mit dem Live-Schlüssel läuft (oder umgekehrt). Kunden-
 * und Preis-IDs sind bei Stripe pro Modus getrennte Namensräume; eine ID aus
 * dem anderen Modus existiert für den aktuell verwendeten Schlüssel schlicht
 * nicht — Stripe antwortet dann nicht mit einer diffusen Netzstörung,
 * sondern exakt mit diesem Fehler. createCheckoutSession
 * (lib/actions/billing.ts) nutzt das, um die veraltete ID zu verwerfen und
 * einmal mit einem neuen Customer neu zu versuchen.
 */
export function istUnbekannterCustomer(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeInvalidRequestError &&
    err.code === "resource_missing" &&
    err.param === "customer"
  );
}

/**
 * Das Abo einer Session, sofern es ausgeklappt vorliegt und aktiv ist.
 *
 * Kein Gratis-Testzeitraum konfiguriert — "trialing" hier bewusst NICHT
 * akzeptiert, im Gegensatz zum Webhook-Handler, der auch künftige
 * Trial-Konfigurationen abdecken soll.
 */
export function aktivesAboAusSession(
  session: Stripe.Checkout.Session,
): Stripe.Subscription | null {
  const subscription = session.subscription;
  if (!subscription || typeof subscription !== "object") return null;
  return subscription.status === "active" ? subscription : null;
}
