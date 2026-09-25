// Was aus einer Checkout-Session geworden ist, wenn die Bestätigung nach der
// Rückkehr (components/AboBestaetigung.tsx) NICHT durchgeht.
//
// Bis hierhin kannte die Abschluss-Seite nur "bezahlt" und "noch nicht
// bezahlt". Eine abgelehnte TWINT-Zahlung landete damit im zweiten Fall und
// las sich als "Deine Zahlung ist unterwegs … geht nichts verloren" — die
// Person wartete auf eine Zahlung, die es nie geben würde, statt es einfach
// noch einmal zu versuchen.
//
// Drei Zustände:
//
// - "bezahlt": die Session ist abgeschlossen und bezahlt. Kommt hier nur an,
//   wenn die Bestätigung selbst gerade nicht durchging (Webhook schneller,
//   Lesefehler) — die Seite behandelt es wie "ausstehend" und prüft weiter.
// - "ausstehend": unterwegs oder unbekannt. Das ist die Antwort, sobald
//   irgendetwas unsicher ist — ein "fehlgeschlagen", das nicht stimmt,
//   schickt jemanden ein zweites Mal zahlen.
// - "fehlgeschlagen": sicher nicht bezahlt, und diese Session wird es auch
//   nicht mehr ohne neuen Versuch: der Zahlungsversuch wurde abgelehnt oder
//   die Session ist abgelaufen.
//
// WO DER VERSUCH STEHT (gemessen am Live-Konto, 2026-09-25)
//
// Im Modus "payment" (Saisonpass) zeigt session.payment_intent darauf. Im
// Modus "subscription" ist session.payment_intent IMMER null und
// session.invoice bleibt null, bis die Session bezahlt ist — das Abo samt
// Rechnung entsteht erst danach. Den Versuch gibt es trotzdem: Checkout legt
// einen PaymentIntent mit description "Subscription creation" am Customer
// an, und dessen payment_details.order_reference ist die ID der Session.
// Eine abgelehnte TWINT-Zahlung steht dort als status
// "requires_payment_method" mit latest_charge.status "failed" (live
// gesehen: "The underlying mandate has been revoked by the buyer").
//
// Rein und ohne Netz, damit es sich prüfen lässt (Vitest kennt nur lib/);
// das Abrufen erledigt lib/actions/billing.ts.
import type Stripe from "stripe";

export type CheckoutErgebnis = "bezahlt" | "ausstehend" | "fehlgeschlagen";

function idVon(feld: string | { id: string } | null | undefined): string | null {
  if (!feld) return null;
  return typeof feld === "string" ? feld : feld.id;
}

/**
 * Der Zahlungsversuch, der zu dieser Session gehört — oder null.
 *
 * Zuerst über session.payment_intent (Modus "payment"), sonst über
 * payment_details.order_reference unter den Kandidaten, die der Aufrufer
 * für den Customer der Session geladen hat. Ein PaymentIntent ohne diese
 * Verknüpfung wird NICHT genommen, auch wenn Zeitpunkt und Betrag passen:
 * zwei offene Sessions (zwei Tabs) hätten sonst denselben Versuch — und die
 * eine würde als abgelehnt gemeldet, weil die andere es war.
 */
export function zahlungsversuchDerSession(
  session: Pick<Stripe.Checkout.Session, "id" | "payment_intent">,
  kandidaten: Stripe.PaymentIntent[],
): Stripe.PaymentIntent | null {
  const direkt = session.payment_intent;
  if (direkt && typeof direkt === "object") return direkt;

  const direktId = idVon(direkt);
  if (direktId) return kandidaten.find((pi) => pi.id === direktId) ?? null;

  const passend = kandidaten
    .filter((pi) => pi.payment_details?.order_reference === session.id)
    .sort((a, b) => b.created - a.created);
  return passend[0] ?? null;
}

// Ein Versuch gilt nur dann als abgelehnt, wenn Stripe das ausdrücklich sagt:
// ein Fehler am PaymentIntent oder eine gescheiterte letzte Belastung.
// "requires_payment_method" allein heisst auch "noch gar nicht versucht".
function versuchAbgelehnt(pi: Stripe.PaymentIntent): boolean {
  if (pi.last_payment_error) return true;
  const charge = pi.latest_charge;
  return typeof charge === "object" && charge !== null && charge.status === "failed";
}

/**
 * Der Zustand einer Session samt ihres Zahlungsversuchs.
 *
 * `versuch` ist, was zahlungsversuchDerSession gefunden hat; für die
 * Ablehnung muss latest_charge ausgeklappt sein, sonst bleibt nur
 * last_payment_error als Beleg.
 */
export function checkoutErgebnis(
  session: Pick<Stripe.Checkout.Session, "status" | "payment_status">,
  versuch: Stripe.PaymentIntent | null,
): CheckoutErgebnis {
  if (session.status === "complete") {
    // Abgeschlossen, aber (noch) nicht bezahlt: eine verzögerte Zahlungsart,
    // deren Geld noch nicht da ist. Das ist unterwegs, nicht gescheitert.
    return session.payment_status === "unpaid" ? "ausstehend" : "bezahlt";
  }

  // Eine abgelaufene Session zieht nichts mehr ein: Stripe lässt eine
  // Session mit laufender Zahlung gar nicht erst ablaufen. Wer hier
  // steht, hat sicher nicht bezahlt und braucht einen neuen Anlauf.
  if (session.status === "expired") return "fehlgeschlagen";

  if (!versuch) return "ausstehend";

  switch (versuch.status) {
    case "canceled":
      return "fehlgeschlagen";
    case "requires_payment_method":
      return versuchAbgelehnt(versuch) ? "fehlgeschlagen" : "ausstehend";
    // processing, requires_action (etwa die TWINT-App noch offen),
    // requires_confirmation, requires_capture, succeeded (Session zieht gleich
    // nach): alles unterwegs.
    default:
      return "ausstehend";
  }
}
