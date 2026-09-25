import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { jahresErsparnisRappen, portalErlaubtWechselZu } from "@/lib/jahresWechsel";
import {
  ZAHLUNG_OFFEN_SPERRT_TAGE,
  aboBrauchtAufmerksamkeit,
  inKulanzfristJetzt,
  statusIstLaufend,
  zahlungNochOffen,
} from "@/lib/offeneZahlung";

describe("jahresErsparnisRappen", () => {
  it("rechnet zwölf Bestands-Monatszahlungen gegen das Jahresabo", () => {
    // CHF 4.90 Bestand gegen CHF 39.00 heute: 58.80 − 39.00 = 19.80.
    expect(
      jahresErsparnisRappen({ rappen: 490, waehrung: "chf" }, { rappen: 3900, waehrung: "chf" }),
    ).toBe(1980);
  });

  it("zeigt nichts, wenn das Jahr nicht günstiger ist", () => {
    expect(
      jahresErsparnisRappen({ rappen: 300, waehrung: "chf" }, { rappen: 3900, waehrung: "chf" }),
    ).toBeNull();
  });

  it("vergleicht nicht über Währungsgrenzen und nicht ohne Preis", () => {
    expect(
      jahresErsparnisRappen({ rappen: 490, waehrung: "chf" }, { rappen: 3900, waehrung: "eur" }),
    ).toBeNull();
    expect(jahresErsparnisRappen(null, { rappen: 3900, waehrung: "chf" })).toBeNull();
  });
});

type Konfig = Pick<Stripe.BillingPortal.Configuration, "active" | "features">;

function konfig(update: Partial<Stripe.BillingPortal.Configuration.Features.SubscriptionUpdate>): Konfig {
  return {
    active: true,
    features: {
      subscription_update: {
        enabled: false,
        default_allowed_updates: [],
        products: null,
        ...update,
      },
    },
  } as Konfig;
}

describe("portalErlaubtWechselZu", () => {
  it("verneint die Live-Konfiguration vom 2026-09-25 (subscription_update aus)", () => {
    expect(portalErlaubtWechselZu(konfig({}), "price_jahr")).toBe(false);
  });

  it("bejaht nur, wenn der Jahrespreis unter den erlaubten Preisen steht", () => {
    const an = konfig({
      enabled: true,
      default_allowed_updates: ["price"],
      products: [{ product: "prod_premium", prices: ["price_jahr", "price_monat"] }] as never,
    });
    expect(portalErlaubtWechselZu(an, "price_jahr")).toBe(true);
    expect(portalErlaubtWechselZu(an, "price_anderer")).toBe(false);
  });

  it("verneint, wenn nur die Menge änderbar ist", () => {
    const nurMenge = konfig({
      enabled: true,
      default_allowed_updates: ["quantity"],
      products: [{ product: "prod_premium", prices: ["price_jahr"] }] as never,
    });
    expect(portalErlaubtWechselZu(nurMenge, "price_jahr")).toBe(false);
  });

  it("verneint ohne Konfiguration oder ohne Preis", () => {
    expect(portalErlaubtWechselZu(null, "price_jahr")).toBe(false);
    expect(portalErlaubtWechselZu(konfig({ enabled: true }), undefined)).toBe(false);
  });
});

describe("zahlungNochOffen", () => {
  const jetzt = Date.parse("2026-09-25T12:00:00Z");
  const tag = 86_400_000;

  it("erkennt past_due und unpaid innerhalb der Frist", () => {
    expect(zahlungNochOffen("past_due", jetzt - 10 * tag, jetzt)).toBe(true);
    expect(zahlungNochOffen("unpaid", jetzt - 10 * tag, jetzt)).toBe(true);
  });

  it("lässt ein altes, nicht mehr eingezogenes Abo los", () => {
    expect(zahlungNochOffen("past_due", jetzt - (ZAHLUNG_OFFEN_SPERRT_TAGE + 1) * tag, jetzt)).toBe(
      false,
    );
  });

  it("zählt ein unbekanntes Periodenende als offen", () => {
    expect(zahlungNochOffen("unpaid", null, jetzt)).toBe(true);
  });

  it("kennt bei laufenden oder beendeten Abos keine offene Zahlung", () => {
    expect(zahlungNochOffen("active", jetzt, jetzt)).toBe(false);
    expect(zahlungNochOffen("canceled", jetzt, jetzt)).toBe(false);
    expect(zahlungNochOffen(null, null, jetzt)).toBe(false);
  });
});

describe("statusIstLaufend", () => {
  it("kennt genau active und trialing", () => {
    expect(statusIstLaufend("active")).toBe(true);
    expect(statusIstLaufend("trialing")).toBe(true);
    expect(statusIstLaufend("past_due")).toBe(false);
    expect(statusIstLaufend("unpaid")).toBe(false);
    expect(statusIstLaufend("canceled")).toBe(false);
    expect(statusIstLaufend(null)).toBe(false);
  });
});

describe("inKulanzfristJetzt", () => {
  const jetzt = Date.parse("2026-09-25T12:00:00Z");
  const tag = 86_400_000;

  it("trägt den Zugang eines past_due-Abos bis zum Fristende", () => {
    // Das ist der Fall, den subscription_ist_premium (0059) in der Datenbank
    // auswertet: past_due, aber ist_premium bleibt true.
    expect(inKulanzfristJetzt("past_due", jetzt + 3 * tag, jetzt)).toBe(true);
  });

  it("endet mit der Frist", () => {
    expect(inKulanzfristJetzt("past_due", jetzt - 1, jetzt)).toBe(false);
  });

  it("kennt ohne Frist keine Kulanz", () => {
    expect(inKulanzfristJetzt("past_due", null, jetzt)).toBe(false);
  });

  it("gilt für ein laufendes Abo nicht, auch mit stehengebliebener Frist", () => {
    // apply_subscription_state räumt kulanz_bis beim Statuswechsel weg (0059);
    // sollte doch ein Datum stehenbleiben, ist ein laufendes Abo trotzdem
    // nicht "in Kulanz".
    expect(inKulanzfristJetzt("active", jetzt + 3 * tag, jetzt)).toBe(false);
  });
});

describe("aboBrauchtAufmerksamkeit", () => {
  const jetzt = Date.parse("2026-09-25T12:00:00Z");
  const tag = 86_400_000;

  it("meldet sich für past_due in der Kulanzfrist", () => {
    // Der Fall, der in lib/premium.ts vom Gratis-Zweig verdeckt wurde: die
    // Frist hält den Zugang, laufend ist das Abo nicht, und eine Zahlung
    // ist offen.
    expect(aboBrauchtAufmerksamkeit("past_due", jetzt + 3 * tag, jetzt - tag, jetzt)).toBe(true);
  });

  it("meldet sich auch nach Ablauf der Kulanzfrist, solange die Zahlung offen ist", () => {
    expect(aboBrauchtAufmerksamkeit("past_due", jetzt - tag, jetzt - tag, jetzt)).toBe(true);
  });

  it("meldet sich für unpaid ohne jede Kulanzfrist", () => {
    expect(aboBrauchtAufmerksamkeit("unpaid", null, jetzt - tag, jetzt)).toBe(true);
  });

  it("schweigt bei einem laufenden Abo", () => {
    expect(aboBrauchtAufmerksamkeit("active", null, jetzt + 20 * tag, jetzt)).toBe(false);
    expect(aboBrauchtAufmerksamkeit("trialing", null, jetzt + 20 * tag, jetzt)).toBe(false);
  });

  it("schweigt bei einem alten, nicht mehr eingezogenen Abo", () => {
    // Weder Kulanz noch einholbare Zahlung: hier darf eine andere Quelle
    // (Saisonpass, Gratis-Premium) den Zugang benennen.
    expect(
      aboBrauchtAufmerksamkeit(
        "past_due",
        jetzt - 90 * tag,
        jetzt - (ZAHLUNG_OFFEN_SPERRT_TAGE + 1) * tag,
        jetzt,
      ),
    ).toBe(false);
  });

  it("schweigt ohne Abo-Zeile", () => {
    expect(aboBrauchtAufmerksamkeit(null, null, null, jetzt)).toBe(false);
  });
});
