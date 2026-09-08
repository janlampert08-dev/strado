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
 * Ein Stripe-Fehler vom Typ "derselbe Idempotency-Key, andere Parameter".
 *
 * Stripe merkt sich zu einem Idempotency-Key die Parameter des ersten
 * Aufrufs — auch dann, wenn dieser Aufruf mit einem Fehler endete. Ein
 * späterer Aufruf mit demselben Key, aber abweichenden Parametern wird
 * deshalb hart abgewiesen, statt die Anfrage auszuführen.
 *
 * Das trifft genau die Fälle, in denen sich zwischen zwei Versuchen etwas
 * am Aufruf ändert: der Selbstheilungs-Versuch mit einem frisch angelegten
 * Customer (siehe istUnbekannterCustomer) und ein Deploy, der die
 * Session-Parameter erweitert, während im selben Zeitfenster noch ein
 * verbrannter Key aus der Vorversion liegt. checkoutIdempotencyKey unten
 * verhindert beides bereits im Schlüssel; diese Prüfung ist das Netz
 * darunter, damit ein solcher Konflikt keinen zahlenden Nutzer aussperrt.
 */
export function istIdempotencyKonflikt(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeIdempotencyError;
}

/**
 * Der Idempotency-Key für das Anlegen einer Checkout-Session.
 *
 * Er trägt jeden Wert, der den Aufruf inhaltlich unterscheidet — Customer
 * und Preis-ID eingeschlossen. Das ist kein Zierrat: lag im Key nur
 * (Nutzer, Plan, Stunde), dann benutzte der Wiederholungsversuch nach einem
 * unbekannten Customer denselben Key mit einer anderen customer-ID, und
 * Stripe wies ihn mit einem idempotency_error ab, statt die Session
 * anzulegen. Ein Wert, der sich ändert, muss auch den Schlüssel ändern.
 *
 * Der Stundenraster bleibt als Ablauf: zwei Klicks kurz hintereinander
 * bekommen dieselbe Session, ein bewusster neuer Anlauf später nicht mehr
 * die alte Antwort.
 *
 * `zusatz` erzwingt einen frischen Key, wenn der reguläre verbrannt ist —
 * siehe istIdempotencyKonflikt.
 */
export function checkoutIdempotencyKey(teile: {
  userId: string;
  plan: string;
  customerId: string;
  preisId: string;
  /** Millisekunden seit Epoch; Default ist die aktuelle Zeit. */
  jetzt?: number;
  zusatz?: string;
}): string {
  const stunde = Math.floor((teile.jetzt ?? Date.now()) / 3_600_000);
  const basis = `checkout:${teile.userId}:${teile.plan}:${teile.customerId}:${teile.preisId}:${stunde}`;
  return teile.zusatz ? `${basis}:${teile.zusatz}` : basis;
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
