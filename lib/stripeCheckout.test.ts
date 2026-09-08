import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import {
  aktivesAboAusSession,
  checkoutIdempotencyKey,
  istEigeneBezahlteSession,
  istIdempotencyKonflikt,
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

describe("istIdempotencyKonflikt", () => {
  it("erkennt den Konflikt aus einem wiederverwendeten Key", () => {
    const fehler = new Stripe.errors.StripeIdempotencyError({
      message: "Keys for idempotent requests can only be used with the same parameters",
    });
    expect(istIdempotencyKonflikt(fehler)).toBe(true);
  });

  it("weist einen anderen Stripe-Fehler ab", () => {
    const fehler = new Stripe.errors.StripeInvalidRequestError({
      code: "resource_missing",
      param: "customer",
    });
    expect(istIdempotencyKonflikt(fehler)).toBe(false);
  });

  it("weist einen Fehler ab, der kein Stripe-Fehler ist", () => {
    expect(istIdempotencyKonflikt(new Error("Netzabbruch"))).toBe(false);
    expect(istIdempotencyKonflikt(null)).toBe(false);
  });
});

describe("checkoutIdempotencyKey", () => {
  const basis = {
    userId: "u1",
    plan: "monat",
    customerId: "cus_alt",
    preisId: "price_monat",
    jetzt: 1_788_884_190_256,
  };

  it("liefert für denselben Aufruf denselben Schlüssel", () => {
    // Der Doppelklick, den der Key abfangen soll: zwei Anfragen, gleiche
    // Parameter, kurz hintereinander — beide müssen dieselbe Session
    // bekommen statt zwei anzulegen.
    expect(checkoutIdempotencyKey(basis)).toBe(checkoutIdempotencyKey({ ...basis, jetzt: basis.jetzt + 1_000 }));
  });

  // Der Kern des Fixes: der Selbstheilungs-Versuch nach einem unbekannten
  // Customer legt einen neuen Customer an und ruft erneut auf. Bliebe der
  // Schlüssel gleich, wiese Stripe den zweiten Aufruf mit einem
  // idempotency_error ab, statt die Session anzulegen.
  it("ändert sich mit dem Customer", () => {
    expect(checkoutIdempotencyKey({ ...basis, customerId: "cus_neu" })).not.toBe(
      checkoutIdempotencyKey(basis),
    );
  });

  it("ändert sich mit der Preis-ID und dem Plan", () => {
    expect(checkoutIdempotencyKey({ ...basis, preisId: "price_jahr" })).not.toBe(
      checkoutIdempotencyKey(basis),
    );
    expect(checkoutIdempotencyKey({ ...basis, plan: "jahr" })).not.toBe(
      checkoutIdempotencyKey(basis),
    );
  });

  it("läuft nach einer Stunde ab", () => {
    expect(checkoutIdempotencyKey({ ...basis, jetzt: basis.jetzt + 3_600_000 })).not.toBe(
      checkoutIdempotencyKey(basis),
    );
  });

  it("erzwingt mit zusatz einen frischen Schlüssel", () => {
    expect(checkoutIdempotencyKey({ ...basis, zusatz: "abc" })).not.toBe(
      checkoutIdempotencyKey(basis),
    );
  });

  it("bleibt unter Stripes Längengrenze von 255 Zeichen", () => {
    const lang = checkoutIdempotencyKey({
      userId: "b91e66d4-b652-4e1b-809a-a00b86d0ff31",
      plan: "monat",
      customerId: "cus_QwErTyUiOpAsDfGh",
      preisId: "price_1PxYzAbCdEfGhIjKlMnOpQrS",
      zusatz: "3f8a1c22-9b4d-4e7a-8f21-5c6d7e8f9a0b",
    });
    expect(lang.length).toBeLessThanOrEqual(255);
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
