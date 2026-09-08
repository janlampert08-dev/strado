import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

// Zerlegt den Header-Wert in { direktive: [quelle, …] }.
function direktiven(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split("; ").map((teil) => {
      const [name, ...quellen] = teil.split(" ");
      return [name, quellen];
    }),
  );
}

const prod = () => direktiven(contentSecurityPolicy(false));

describe("contentSecurityPolicy", () => {
  it("liefert jede Direktive genau einmal", () => {
    const namen = contentSecurityPolicy(false)
      .split("; ")
      .map((teil) => teil.split(" ")[0]);
    expect(new Set(namen).size).toBe(namen.length);
  });

  // Die offizielle Liste aus https://docs.stripe.com/security/guide.
  // Fehlt hier eine Zeile, bricht der Live-Kauf im Browser und sonst
  // nirgendwo — der Verstoss landet nur in der Konsole des Zahlenden.
  describe("Stripe.js", () => {
    it("erlaubt das Skript und Stripes Unter-Origins", () => {
      expect(prod()["script-src"]).toContain("https://js.stripe.com");
      expect(prod()["script-src"]).toContain("https://*.js.stripe.com");
    });

    it("erlaubt Stripes Iframes samt 3-D Secure und Betrugserkennung", () => {
      expect(prod()["frame-src"]).toContain("https://*.stripe.com");
      expect(prod()["frame-src"]).toContain("https://m.stripe.network");
    });

    it("erlaubt die Aufrufe an Stripe", () => {
      expect(prod()["connect-src"]).toContain("https://*.stripe.com");
      expect(prod()["connect-src"]).toContain("https://m.stripe.network");
    });

    it("erlaubt Stripes Bilder", () => {
      expect(prod()["img-src"]).toContain("https://*.stripe.com");
    });

    // FONTS in components/PremiumCheckoutForm.tsx reicht dem Payment
    // Element ein Stylesheet als Adresse; geladen wird es vom Element,
    // nicht von unserer Seite — deshalb connect-src und nicht style-src.
    it("erlaubt das Schrift-Stylesheet des Payment Elements", () => {
      expect(prod()["connect-src"]).toContain("https://fonts.googleapis.com");
    });
  });

  // Link ist im Payment Element aktiv und läuft über Stripe-eigene
  // link.com-Hosts, die *.stripe.com nicht abdeckt. Ohne diese Freigaben
  // warf checkout.confirm() eine Ausnahme, statt ein Ergebnis zu liefern.
  describe("Link", () => {
    it("erlaubt Links Iframes", () => {
      expect(prod()["frame-src"]).toContain("https://link.com");
      expect(prod()["frame-src"]).toContain("https://*.link.com");
    });

    it("erlaubt Links Aufrufe", () => {
      expect(prod()["connect-src"]).toContain("https://link.com");
      expect(prod()["connect-src"]).toContain("https://*.link.com");
    });

    it("erlaubt Links Bilder", () => {
      expect(prod()["img-src"]).toContain("https://*.link.com");
    });
  });

  // Weiterleitungs-Zahlungsarten (TWINT vor allem) steigen über einen
  // Formular-POST an einen Stripe-eigenen Zwischenhost ein.
  it("erlaubt den Formular-Einstieg zu Stripe und Link", () => {
    expect(prod()["form-action"]).toEqual([
      "'self'",
      "https://*.stripe.com",
      "https://link.com",
      "https://*.link.com",
    ]);
  });

  describe("Absicherung", () => {
    it("bleibt bei default-src 'self' und verbietet Plugins und fremde Rahmen", () => {
      expect(prod()["default-src"]).toEqual(["'self'"]);
      expect(prod()["object-src"]).toEqual(["'none'"]);
      expect(prod()["frame-ancestors"]).toEqual(["'none'"]);
      expect(prod()["base-uri"]).toEqual(["'self'"]);
    });

    it("lässt keine Fremd-Origin ausserhalb der bekannten Dienste zu", () => {
      const erlaubt = [
        "supabase.co",
        "mapbox.com",
        "stripe.com",
        "stripe.network",
        "link.com",
        "open-meteo.com",
        "googleapis.com",
        "gstatic.com",
      ];
      const fremd = Object.values(prod())
        .flat()
        .filter((quelle) => quelle.startsWith("https://"))
        .filter((quelle) => !erlaubt.some((host) => quelle.endsWith(host)));
      expect(fremd).toEqual([]);
    });

    // Die Dev-Ausnahmen sind der einzige Unterschied zwischen den beiden
    // Fassungen — landen sie in Produktion, ist die Policy dort löchrig.
    it("liefert die Dev-Ausnahmen nur im Entwicklungsmodus", () => {
      expect(contentSecurityPolicy(false)).not.toContain("va.vercel-scripts.com");
      expect(prod()["connect-src"]).not.toContain("ws:");

      const entwicklung = direktiven(contentSecurityPolicy(true));
      expect(entwicklung["script-src"]).toContain("https://va.vercel-scripts.com");
      expect(entwicklung["connect-src"]).toContain("ws:");
    });
  });
});
