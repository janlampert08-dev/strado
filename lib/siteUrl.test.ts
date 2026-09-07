import { describe, it, expect, afterEach } from "vitest";
import { siteUrl } from "./siteUrl";

const urspruenglich = {
  site: process.env.NEXT_PUBLIC_SITE_URL,
  vercel: process.env.VERCEL_PROJECT_PRODUCTION_URL,
};

function setze(site?: string, vercel?: string) {
  if (site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = site;

  if (vercel === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = vercel;
}

afterEach(() => {
  setze(urspruenglich.site, urspruenglich.vercel);
});

describe("siteUrl", () => {
  it("nimmt die ausdrücklich gesetzte Variable", () => {
    setze("https://app.strado.ch", "produktion.beispiel.test");
    expect(siteUrl()).toBe("https://app.strado.ch");
  });

  // Der eigentliche Grund für diese Datei: eine vergessene Variable schickte
  // die zahlende Person aus Stripes Kundenportal auf ihren eigenen Rechner.
  it("fällt ohne Variable auf die Produktions-Domain von Vercel zurück", () => {
    setze(undefined, "app.strado.ch");
    expect(siteUrl()).toBe("https://app.strado.ch");
  });

  // .env.local.example führt die Variable ohne Wert. Eine daraus kopierte
  // Datei liefert "", und ?? hätte den erhalten: aus return_url würde
  // "/profil", eine relative URL, die Stripe zurückweist.
  it("behandelt einen leeren Wert wie eine nicht gesetzte Variable", () => {
    setze("", "app.strado.ch");
    expect(siteUrl()).toBe("https://app.strado.ch");
  });

  it("behandelt auch reinen Leerraum wie nicht gesetzt", () => {
    setze("   ", "app.strado.ch");
    expect(siteUrl()).toBe("https://app.strado.ch");
  });

  it("weist einen unbrauchbaren Wert zurück und geht eine Stufe weiter", () => {
    setze("nicht-mal-eine-url", "app.strado.ch");
    expect(siteUrl()).toBe("https://app.strado.ch");
  });

  // Sonst entstünde aus `${siteUrl()}/profil` ein doppelter Schrägstrich.
  it("entfernt abschliessende Schrägstriche", () => {
    setze("https://app.strado.ch///", undefined);
    expect(siteUrl()).toBe("https://app.strado.ch");
  });

  it("nutzt localhost nur, wenn keine der beiden Quellen etwas liefert", () => {
    setze(undefined, undefined);
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  // Vercel liefert den Hostnamen ohne Schema; ein leerer Wert darf nicht zu
  // "https://" werden.
  it("ignoriert eine leere Vercel-Variable", () => {
    setze(undefined, "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  // Die Zusicherung hinter allen Fällen: das Ergebnis ist immer eine
  // absolute URL ohne abschliessenden Schrägstrich, denn Stripe weist eine
  // relative return_url zurück.
  it("liefert immer eine absolute URL ohne Schlussschrägstrich", () => {
    for (const [site, vercel] of [
      [undefined, undefined],
      ["", ""],
      ["  ", "  "],
      ["https://app.strado.ch/", undefined],
      ["nicht-mal-eine-url", "app.strado.ch"],
      [undefined, "app.strado.ch"],
    ] as [string | undefined, string | undefined][]) {
      setze(site, vercel);
      const url = siteUrl();
      expect(url).toMatch(/^https?:\/\/.+[^/]$/);
      expect(() => new URL(url)).not.toThrow();
    }
  });
});
