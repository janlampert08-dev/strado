// Was eine Rückbuchung (Chargeback, "Dispute") für Premium bedeutet.
//
// Bis hierhin kannte der Webhook sie nicht: wer eine Zahlung bei seiner Bank
// zurückholte, behielt den Saisonpass bis zum Ende bzw. das Abo lief weiter
// und buchte die nächste Periode ab — die nächste Rückbuchung inklusive
// Gebühr. Der Eigentümer hat charge.dispute.* am Live-Endpunkt abonniert
// (gelesen 2026-09-25: created, updated, closed, funds_withdrawn,
// funds_reinstated).
//
// Rein und ohne Netz, damit es mit Fixture-Ereignissen geprüft werden kann;
// der Handler in app/api/stripe/webhook/route.ts verdrahtet Abruf und
// Schreibvorgang.
import type Stripe from "stripe";

/**
 * - "entziehen": Das Geld ist weg oder wird es — Pass zurücknehmen bzw. Abo
 *   kündigen. Idempotent: dieselbe Wirkung, egal wie oft sie eintrifft
 *   (saisonpass_erstatten setzt coalesce, ein gekündigtes Abo wird nicht
 *   noch einmal gekündigt).
 * - "gewonnen": Stripe hat zu unseren Gunsten entschieden. Zurückgegeben
 *   wird nichts automatisch — ein zurückgenommener Pass lässt sich ohne
 *   eigene Funktion nicht wieder einsetzen, ein gekündigtes Abo gar nicht.
 *   Der Handler loggt es laut, für die Hand des Eigentümers.
 * - "ignorieren": alles andere (Rückfrage der Bank, Zwischenstände).
 */
export type DisputeAktion = "entziehen" | "gewonnen" | "ignorieren";

export function disputeAktion(eventType: string, dispute: Pick<Stripe.Dispute, "status">): DisputeAktion {
  // Eine Rückfrage der Bank ("inquiry", Status warning_*) ist noch keine
  // Rückbuchung: kein Geld bewegt, oft erledigt sie sich mit einer Antwort.
  // Premium deswegen zu entziehen hiesse, ehrliche Kundschaft auf Verdacht
  // auszusperren. Wird aus ihr ein echter Chargeback, kommt
  // charge.dispute.funds_withdrawn — dort greift es dann.
  const nurRueckfrage = dispute.status.startsWith("warning_");

  switch (eventType) {
    case "charge.dispute.created":
      return nurRueckfrage ? "ignorieren" : "entziehen";
    // Das Geld ist abgebucht. Deckt auch die zur Rückbuchung gewordene
    // Rückfrage ab, für die kein zweites "created" kommt.
    case "charge.dispute.funds_withdrawn":
      return "entziehen";
    case "charge.dispute.closed":
      if (dispute.status === "lost") return "entziehen";
      if (dispute.status === "won") return "gewonnen";
      return "ignorieren";
    default:
      return "ignorieren";
  }
}

function idVon(feld: string | { id: string } | null | undefined): string | null {
  if (!feld) return null;
  return typeof feld === "string" ? feld : feld.id;
}

/** Die PaymentIntent-ID hinter der Rückbuchung — über sie hängen Saisonpass
 *  (saisonpaesse.stripe_payment_intent_id) und Abo-Rechnung
 *  (invoice_payments) an der Zahlung. */
export function paymentIntentVonDispute(
  dispute: Pick<Stripe.Dispute, "payment_intent">,
): string | null {
  return idVon(dispute.payment_intent);
}
