import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { disputeAktion, paymentIntentVonDispute } from "@/lib/stripeDisputes";

// Fixture-Ereignisse in der Form, in der Stripe sie schickt — gekürzt auf
// die Felder, die gelesen werden.
function ereignis(
  type: string,
  dispute: Partial<Stripe.Dispute>,
): { type: string; data: { object: Stripe.Dispute } } {
  return {
    type,
    data: {
      object: {
        id: "dp_1",
        object: "dispute",
        amount: 2900,
        currency: "chf",
        charge: "ch_1",
        payment_intent: "pi_pass",
        reason: "fraudulent",
        status: "needs_response",
        ...dispute,
      } as Stripe.Dispute,
    },
  };
}

function aktion(e: ReturnType<typeof ereignis>) {
  return disputeAktion(e.type, e.data.object);
}

describe("disputeAktion", () => {
  it("entzieht bei einer eröffneten Rückbuchung", () => {
    expect(aktion(ereignis("charge.dispute.created", { status: "needs_response" }))).toBe(
      "entziehen",
    );
  });

  it("lässt eine blosse Rückfrage der Bank (inquiry) unangetastet", () => {
    expect(
      aktion(ereignis("charge.dispute.created", { status: "warning_needs_response" })),
    ).toBe("ignorieren");
  });

  it("entzieht, sobald das Geld abgebucht ist — auch nach einer Rückfrage", () => {
    expect(
      aktion(ereignis("charge.dispute.funds_withdrawn", { status: "needs_response" })),
    ).toBe("entziehen");
  });

  it("entzieht bei verlorener, meldet bei gewonnener Rückbuchung", () => {
    expect(aktion(ereignis("charge.dispute.closed", { status: "lost" }))).toBe("entziehen");
    expect(aktion(ereignis("charge.dispute.closed", { status: "won" }))).toBe("gewonnen");
    expect(aktion(ereignis("charge.dispute.closed", { status: "warning_closed" }))).toBe(
      "ignorieren",
    );
  });

  it("ignoriert Zwischenstände und Rückerstattung der Gebühr", () => {
    expect(aktion(ereignis("charge.dispute.updated", { status: "under_review" }))).toBe(
      "ignorieren",
    );
    expect(aktion(ereignis("charge.dispute.funds_reinstated", { status: "won" }))).toBe(
      "ignorieren",
    );
  });
});

describe("paymentIntentVonDispute", () => {
  it("liest die ID als Zeichenkette oder aus dem ausgeklappten Objekt", () => {
    expect(paymentIntentVonDispute(ereignis("charge.dispute.created", {}).data.object)).toBe(
      "pi_pass",
    );
    expect(
      paymentIntentVonDispute({ payment_intent: { id: "pi_abo" } as Stripe.PaymentIntent }),
    ).toBe("pi_abo");
    expect(paymentIntentVonDispute({ payment_intent: null })).toBeNull();
  });
});
