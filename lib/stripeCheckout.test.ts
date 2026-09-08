import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import {
  aktivesAboAusSession,
  istEigeneBezahlteSession,
  istUnbekannterCustomer,
  passendeOffeneSession,
  preisVonSession,
} from "@/lib/stripeCheckout";

// Nur die Felder, die die geprüften Funktionen anfassen. Der Cast hält den
// Test lesbar: eine vollständige Stripe.Checkout.Session hier auszuschreiben
// würde die eigentliche Aussage jedes Falls unter Feldern begraben, die
// keine Rolle spielen.
function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_1",
    object: "checkout.session",
    amount_total: 900,
    client_secret: "cs_1_secret",
    currency: "chf",
    customer: "cus_ich",
    metadata: { price_id: "price_monat" },
    mode: "subscription",
    payment_status: "paid",
    status: "complete",
    subscription: null,
    ui_mode: "elements",
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function abo(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return { id: "sub_1", object: "subscription", status: "active", ...overrides } as Stripe.Subscription;
}

describe("preisVonSession", () => {
  it("liefert den Gesamtbetrag der Session", () => {
    expect(preisVonSession(session({ amount_total: 9900, currency: "chf" }))).toEqual({
      betragRappen: 9900,
      waehrung: "chf",
    });
  });

  it("liefert auch einen Betrag von 0 statt null", () => {
    // 0 ist ein gültiger Betrag und darf nicht über die Falsy-Prüfung
    // verschwinden — sonst fiele der Aufrufer auf den Katalogpreis zurück
    // und zeichnete einen Betrag aus, der nicht abgebucht wird.
    expect(preisVonSession(session({ amount_total: 0 }))).toEqual({
      betragRappen: 0,
      waehrung: "chf",
    });
  });

  it("liefert null ohne Betrag oder ohne Währung", () => {
    expect(preisVonSession(session({ amount_total: null }))).toBeNull();
    expect(preisVonSession(session({ currency: null }))).toBeNull();
  });
});

describe("passendeOffeneSession", () => {
  it("findet die Session zum gesuchten Preis", () => {
    const treffer = session({ id: "cs_monat" });
    const andere = session({ id: "cs_jahr", metadata: { price_id: "price_jahr" } });
    expect(passendeOffeneSession([andere, treffer], "price_monat")?.id).toBe("cs_monat");
  });

  it("nimmt keine Session eines anderen Plans", () => {
    expect(passendeOffeneSession([session()], "price_jahr")).toBeNull();
  });

  it("nimmt keine Session ohne Client-Secret oder ohne Betrag", () => {
    expect(passendeOffeneSession([session({ client_secret: null })], "price_monat")).toBeNull();
    expect(passendeOffeneSession([session({ amount_total: null })], "price_monat")).toBeNull();
  });

  it("nimmt keine Session aus einem anderen Modus", () => {
    expect(passendeOffeneSession([session({ mode: "payment" })], "price_monat")).toBeNull();
    expect(passendeOffeneSession([session({ ui_mode: "hosted_page" })], "price_monat")).toBeNull();
  });

  it("liefert null für eine leere Liste", () => {
    expect(passendeOffeneSession([], "price_monat")).toBeNull();
  });
});

describe("istEigeneBezahlteSession", () => {
  it("erkennt die bezahlte Session des eigenen Kontos", () => {
    expect(istEigeneBezahlteSession(session(), "cus_ich")).toBe(true);
  });

  it("akzeptiert den ausgeklappten Customer", () => {
    const ausgeklappt = { id: "cus_ich" } as Stripe.Customer;
    expect(istEigeneBezahlteSession(session({ customer: ausgeklappt }), "cus_ich")).toBe(true);
  });

  // Der Kern der Prüfung: die Session-ID kommt aus der Adresszeile. Ohne die
  // Bindung an den eigenen Customer liesse sich mit einer fremden, bezahlten
  // Session-ID Premium für das eigene Konto einschalten.
  it("weist die Session eines fremden Kontos ab", () => {
    expect(istEigeneBezahlteSession(session({ customer: "cus_fremd" }), "cus_ich")).toBe(false);
  });

  it("weist eine Session ohne Customer ab", () => {
    expect(istEigeneBezahlteSession(session({ customer: null }), "cus_ich")).toBe(false);
  });

  it("weist eine noch offene Session ab", () => {
    expect(istEigeneBezahlteSession(session({ status: "open" }), "cus_ich")).toBe(false);
  });

  it("weist eine abgeschlossene, aber unbezahlte Session ab", () => {
    expect(istEigeneBezahlteSession(session({ payment_status: "unpaid" }), "cus_ich")).toBe(false);
    expect(
      istEigeneBezahlteSession(session({ payment_status: "no_payment_required" }), "cus_ich"),
    ).toBe(false);
  });

  it("weist eine Einmalzahlung ab", () => {
    expect(istEigeneBezahlteSession(session({ mode: "payment" }), "cus_ich")).toBe(false);
  });
});

describe("istUnbekannterCustomer", () => {
  it("erkennt einen unbekannten Customer", () => {
    const fehler = new Stripe.errors.StripeInvalidRequestError({
      code: "resource_missing",
      param: "customer",
    });
    expect(istUnbekannterCustomer(fehler)).toBe(true);
  });

  it("weist denselben Fehlercode zu einem anderen Parameter ab", () => {
    // resource_missing kommt auch für andere Felder vor (z.B. eine Preis-ID)
    // — nur "customer" heisst "veraltete ID, neu anlegen und wiederholen".
    const fehler = new Stripe.errors.StripeInvalidRequestError({
      code: "resource_missing",
      param: "price",
    });
    expect(istUnbekannterCustomer(fehler)).toBe(false);
  });

  it("weist einen anderen Stripe-Fehlercode ab", () => {
    const fehler = new Stripe.errors.StripeInvalidRequestError({
      code: "parameter_invalid_empty",
      param: "customer",
    });
    expect(istUnbekannterCustomer(fehler)).toBe(false);
  });

  it("weist einen Fehler ab, der kein Stripe-Fehler ist", () => {
    expect(istUnbekannterCustomer(new Error("Netzabbruch"))).toBe(false);
    expect(istUnbekannterCustomer("resource_missing")).toBe(false);
    expect(istUnbekannterCustomer(null)).toBe(false);
  });
});

describe("aktivesAboAusSession", () => {
  it("liefert das ausgeklappte, aktive Abo", () => {
    expect(aktivesAboAusSession(session({ subscription: abo() }))?.id).toBe("sub_1");
  });

  it("liefert null für ein Abo, das nicht aktiv ist", () => {
    expect(aktivesAboAusSession(session({ subscription: abo({ status: "incomplete" }) }))).toBeNull();
    // trialing ist hier bewusst kein Erfolg — anders als im Webhook-Handler.
    expect(aktivesAboAusSession(session({ subscription: abo({ status: "trialing" }) }))).toBeNull();
  });

  it("liefert null, wenn nur die Abo-ID dasteht", () => {
    // Ohne expand: ["subscription"] käme hier ein String an. Den Status kennt
    // die Funktion dann nicht und darf ihn nicht annehmen.
    expect(aktivesAboAusSession(session({ subscription: "sub_1" }))).toBeNull();
  });

  it("liefert null ohne Abo", () => {
    expect(aktivesAboAusSession(session({ subscription: null }))).toBeNull();
  });
});
