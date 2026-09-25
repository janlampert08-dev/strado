import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { checkoutErgebnis, zahlungsversuchDerSession } from "@/lib/checkoutErgebnis";

// Fixtures nach den Objekten, die das Live-Konto am 2026-09-25 tatsächlich
// zurückgab (Subscription-Session mit abgelehnter TWINT-Zahlung): nur die
// Felder, die die Funktionen lesen.

type SessionTeil = Pick<Stripe.Checkout.Session, "id" | "status" | "payment_status" | "payment_intent">;

function session(overrides: Partial<SessionTeil> = {}): SessionTeil {
  return {
    id: "cs_live_a1",
    status: "open",
    payment_status: "unpaid",
    payment_intent: null,
    ...overrides,
  };
}

function versuch(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {
    id: "pi_1",
    object: "payment_intent",
    created: 1_790_199_492,
    status: "requires_payment_method",
    last_payment_error: null,
    latest_charge: null,
    description: "Subscription creation",
    payment_details: { customer_reference: null, order_reference: "cs_live_a1" },
    ...overrides,
  } as Stripe.PaymentIntent;
}

const abgelehnteBelastung = { id: "py_1", object: "charge", status: "failed" } as Stripe.Charge;

describe("checkoutErgebnis", () => {
  it("meldet eine abgeschlossene, bezahlte Session als bezahlt", () => {
    expect(checkoutErgebnis(session({ status: "complete", payment_status: "paid" }), null)).toBe(
      "bezahlt",
    );
    expect(
      checkoutErgebnis(session({ status: "complete", payment_status: "no_payment_required" }), null),
    ).toBe("bezahlt");
  });

  it("hält eine abgeschlossene, noch unbezahlte Session für unterwegs", () => {
    // Verzögerte Zahlungsart: Session complete, Geld noch nicht da.
    expect(checkoutErgebnis(session({ status: "complete", payment_status: "unpaid" }), null)).toBe(
      "ausstehend",
    );
  });

  it("meldet eine abgelaufene Session als fehlgeschlagen", () => {
    expect(checkoutErgebnis(session({ status: "expired" }), null)).toBe("fehlgeschlagen");
  });

  it("meldet eine abgelehnte TWINT-Zahlung als fehlgeschlagen", () => {
    // Der Live-Fall: requires_payment_method, letzte Belastung failed.
    expect(checkoutErgebnis(session(), versuch({ latest_charge: abgelehnteBelastung }))).toBe(
      "fehlgeschlagen",
    );
  });

  it("nimmt last_payment_error als Beleg, auch ohne ausgeklappte Belastung", () => {
    const fehler = { type: "card_error", code: "card_declined" } as Stripe.PaymentIntent.LastPaymentError;
    expect(
      checkoutErgebnis(session(), versuch({ last_payment_error: fehler, latest_charge: "py_1" })),
    ).toBe("fehlgeschlagen");
  });

  it("hält requires_payment_method ohne Beleg für noch nicht versucht", () => {
    expect(checkoutErgebnis(session(), versuch())).toBe("ausstehend");
  });

  it("hält processing und requires_action für unterwegs", () => {
    // processing: TWINT/Bank bestätigt noch. requires_action: die TWINT-App
    // ist womöglich noch offen. Beides darf nie "fehlgeschlagen" heissen.
    expect(checkoutErgebnis(session(), versuch({ status: "processing" }))).toBe("ausstehend");
    expect(checkoutErgebnis(session(), versuch({ status: "requires_action" }))).toBe("ausstehend");
    expect(checkoutErgebnis(session(), versuch({ status: "succeeded" }))).toBe("ausstehend");
  });

  it("meldet einen abgebrochenen Versuch als fehlgeschlagen", () => {
    expect(checkoutErgebnis(session(), versuch({ status: "canceled" }))).toBe("fehlgeschlagen");
  });

  it("bleibt ohne gefundenen Versuch bei ausstehend", () => {
    expect(checkoutErgebnis(session(), null)).toBe("ausstehend");
  });
});

describe("zahlungsversuchDerSession", () => {
  it("nimmt im Modus payment den ausgeklappten PaymentIntent der Session", () => {
    const pi = versuch({ id: "pi_pass" });
    expect(zahlungsversuchDerSession(session({ payment_intent: pi }), [])).toBe(pi);
  });

  it("findet eine nur als ID verlinkte Zahlung unter den Kandidaten", () => {
    const pi = versuch({ id: "pi_pass", payment_details: undefined });
    expect(zahlungsversuchDerSession(session({ payment_intent: "pi_pass" }), [pi])).toBe(pi);
  });

  it("ordnet im Modus subscription über order_reference zu", () => {
    const eigener = versuch({ id: "pi_eigen" });
    const fremd = versuch({
      id: "pi_fremd",
      created: 1_790_199_999,
      payment_details: { customer_reference: null, order_reference: "cs_live_andere" },
    });
    expect(zahlungsversuchDerSession(session(), [fremd, eigener])).toBe(eigener);
  });

  it("nimmt keinen Versuch ohne Verknüpfung, auch wenn er zeitlich passt", () => {
    // Zwei offene Tabs: der abgelehnte Versuch der einen Session darf die
    // andere nicht als gescheitert melden.
    const ohne = versuch({ payment_details: undefined });
    expect(zahlungsversuchDerSession(session(), [ohne])).toBeNull();
  });

  it("nimmt bei mehreren Versuchen derselben Session den jüngsten", () => {
    const alt = versuch({ id: "pi_alt", created: 100 });
    const neu = versuch({ id: "pi_neu", created: 200 });
    expect(zahlungsversuchDerSession(session(), [alt, neu])).toBe(neu);
  });
});
