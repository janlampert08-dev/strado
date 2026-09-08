import { describe, expect, it } from "vitest";
import { fehlerMeldung } from "./checkoutFehler";

// Diese Meldung ist im Zweifel die einzige Spur eines gescheiterten Kaufs:
// checkout.confirm() läuft im Browser, es gibt keine
// Fehlerberichterstattung, und was hier herausfällt, landet über
// meldeCheckoutProblem im Server-Log. Sie darf deshalb weder leer noch
// "[object Object]" sein.
describe("fehlerMeldung", () => {
  it("nennt bei einem Error Name und Meldung", () => {
    expect(fehlerMeldung(new TypeError("Failed to fetch"))).toBe("TypeError: Failed to fetch");
  });

  it("behält einen benannten Fehlertyp — daran hängt die Diagnose", () => {
    class IntegrationError extends Error {
      override name = "IntegrationError";
    }
    expect(fehlerMeldung(new IntegrationError("You cannot provide `returnUrl`"))).toBe(
      "IntegrationError: You cannot provide `returnUrl`",
    );
  });

  it("reicht eine geworfene Zeichenkette unverändert durch", () => {
    expect(fehlerMeldung("Netz weg")).toBe("Netz weg");
  });

  it("macht auch aus einem geworfenen Nicht-Fehler etwas Lesbares", () => {
    expect(fehlerMeldung(null)).toBe("null");
    expect(fehlerMeldung(undefined)).toBe("undefined");
    expect(fehlerMeldung(42)).toBe("42");
  });
});
