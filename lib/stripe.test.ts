import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Audit-Befund A6: der Stripe-Client wurde auf Modulebene konstruiert. Next
// importiert die Webhook-Route beim Sammeln der Seitendaten, also brach
// `next build` ohne gesetztes STRIPE_SECRET_KEY mit "Neither apiKey nor
// config.authenticator provided" ab — eine Meldung, die die Ursache nicht
// nennt. Betroffen war jeder Build ohne vollständige Secrets.
//
// vi.resetModules() vor jedem Fall, weil getStripe() den Client für die
// Lebensdauer des Moduls zwischenspeichert: ohne frischen Import prüfte der
// zweite Test nur noch die Zwischenspeicherung des ersten.
describe("getStripe", () => {
  let gesichert: string | undefined;

  beforeEach(() => {
    gesichert = process.env.STRIPE_SECRET_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    if (gesichert === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = gesichert;
  });

  it("lässt sich ohne Schlüssel importieren", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    // Der Import selbst ist der Test: vorher warf genau er.
    await expect(import("@/lib/stripe")).resolves.toBeDefined();
  });

  it("wirft erst beim Aufruf, und nennt die fehlende Variable", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { getStripe } = await import("@/lib/stripe");
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("liefert mit Schlüssel denselben Client zurück", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_platzhalter";
    const { getStripe } = await import("@/lib/stripe");
    expect(getStripe()).toBe(getStripe());
  });
});
