import { describe, it, expect } from "vitest";
import { betragText, jahresVorteilProzent, monatsAequivalentRappen } from "./premiumAngebot";
import type { PlanAngebot } from "./premiumLimits";

function plan(betragRappen: number, teil: Partial<PlanAngebot> = {}): PlanAngebot {
  return {
    plan: "jahr",
    betragRappen,
    waehrung: "chf",
    istGruenderpreis: false,
    regulaerRappen: null,
    ...teil,
  };
}

describe("betragText", () => {
  it("schreibt Rappen als Frankenbetrag mit zwei Nachkommastellen", () => {
    //   statt eines gewöhnlichen Leerzeichens: Intl trennt Währung und
    // Betrag mit einem geschützten Leerzeichen, damit die Zeile nicht
    // zwischen "CHF" und der Zahl umbricht.
    expect(betragText(4900, "chf")).toBe("CHF 49.00");
    expect(betragText(490, "chf")).toBe("CHF 4.90");
  });

  it("nimmt die Währung so, wie Stripe sie führt (klein geschrieben)", () => {
    expect(betragText(1000, "eur")).toBe(betragText(1000, "EUR"));
  });
});

describe("monatsAequivalentRappen", () => {
  it("rechnet den Jahrespreis auf einen Monat herunter", () => {
    expect(monatsAequivalentRappen(4900)).toBe(408);
    expect(monatsAequivalentRappen(3900)).toBe(325);
  });

  it("rundet auf ganze Rappen statt Bruchteile anzuzeigen", () => {
    expect(monatsAequivalentRappen(100)).toBe(8);
  });
});

describe("jahresVorteilProzent", () => {
  it("beziffert den Vorteil gegenüber zwölf Monatszahlungen", () => {
    // CHF 4.90 × 12 = CHF 58.80 gegenüber CHF 49.00 — die zwei Gratismonate
    // aus docs/premium-plan.md, Abschnitt 6.
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), plan(4900))).toBe(17);
  });

  it("rechnet den Gründerpreis gegen denselben Monatspreis", () => {
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), plan(3900))).toBe(34);
  });

  it("behauptet keinen Vorteil, wenn der Jahresplan nicht günstiger ist", () => {
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), plan(5880))).toBeNull();
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), plan(6000))).toBeNull();
  });

  it("vergleicht keine unterschiedlichen Währungen", () => {
    // Ein Prozentsatz aus CHF gegen EUR wäre eine erfundene Zahl auf einer
    // Kaufseite — lieber kein Abzeichen als ein falsches.
    expect(
      jahresVorteilProzent(plan(490, { plan: "monat", waehrung: "eur" }), plan(4900)),
    ).toBeNull();
  });

  it("bleibt still, solange ein Plan fehlt", () => {
    expect(jahresVorteilProzent(undefined, plan(4900))).toBeNull();
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), undefined)).toBeNull();
  });
});
