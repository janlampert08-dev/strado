import { describe, it, expect, afterEach, vi } from "vitest";

// LEGAL_URLS wird beim Import ausgewertet (Modul-Konstante), deshalb muss
// jeder Fall das Modul frisch laden.
async function legalUrls(basis?: string) {
  vi.resetModules();
  if (basis === undefined) {
    delete process.env.NEXT_PUBLIC_LEGAL_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_LEGAL_BASE_URL = basis;
  }
  return (await import("./constants")).LEGAL_URLS;
}

const urspruenglich = process.env.NEXT_PUBLIC_LEGAL_BASE_URL;

afterEach(() => {
  if (urspruenglich === undefined) delete process.env.NEXT_PUBLIC_LEGAL_BASE_URL;
  else process.env.NEXT_PUBLIC_LEGAL_BASE_URL = urspruenglich;
});

describe("LEGAL_URLS", () => {
  it("zeigt ohne Umgebungsvariable auf die heute erreichbare Adresse", async () => {
    // strado.ch ist registriert und liefert die Rechtstexte unter /legal/…
    // tatsächlich aus — erst das macht sie zum zulässigen Standard. Eine
    // noch nicht registrierte oder nicht antwortende Domain als Standard
    // wäre derselbe Fehler wie das frühere xyz.ch.
    expect(await legalUrls(undefined)).toEqual({
      impressum: "https://strado.ch/legal/impressum",
      datenschutz: "https://strado.ch/legal/datenschutz",
      agb: "https://strado.ch/legal/agb",
    });
  });

  it("übernimmt eine gesetzte Basis-URL", async () => {
    // Bewusst eine andere Adresse als der Standard: mit strado.ch wäre
    // nicht unterscheidbar, ob die Variable gegriffen hat.
    const urls = await legalUrls("https://rechtstexte.beispiel.test");
    expect(urls.agb).toBe("https://rechtstexte.beispiel.test/legal/agb");
  });

  // .env.local.example führt NEXT_PUBLIC_LEGAL_BASE_URL ohne Wert. Eine
  // daraus kopierte Datei liefert einen leeren String, und ?? hätte den
  // erhalten: LEGAL_BASE_URL wäre "" und aus den Links würden relative
  // Pfade. Die zeigen dann auf die App-Domain, wo es keine Rechtstexte gibt.
  it("behandelt einen leeren Wert wie eine nicht gesetzte Variable", async () => {
    const urls = await legalUrls("");
    expect(urls.impressum).toBe("https://strado.ch/legal/impressum");
  });

  it("behandelt auch reinen Leerraum wie nicht gesetzt", async () => {
    const urls = await legalUrls("   ");
    expect(urls.impressum).toBe("https://strado.ch/legal/impressum");
  });

  // Ein http-Wert würde auf unverschlüsselt ausgelieferte Rechtstexte
  // zeigen. Fällt auf den Standard zurück statt zu werfen — diese Datei wird
  // beim Modulladen ausgewertet, eine Ausnahme nähme die Anwendung mit.
  it("weist eine http-Basis zurück und nimmt den Standard", async () => {
    // Bewusst ein anderer Host als der Standard: mit http://strado.ch wäre
    // ein blosses Hochstufen des Schemas nicht vom Rückfall auf den
    // Standard zu unterscheiden.
    const urls = await legalUrls("http://unsicher.test");
    expect(urls.agb).toBe("https://strado.ch/legal/agb");
  });

  it("weist eine unbrauchbare Basis zurück und nimmt den Standard", async () => {
    const urls = await legalUrls("nicht-mal-eine-url");
    expect(urls.agb).toBe("https://strado.ch/legal/agb");
  });

  // Die eigentliche Zusicherung hinter allen Fällen oben: die Links sind
  // IMMER absolut und IMMER https. Ein relativer Rechtstext-Link zeigt auf
  // die falsche Seite, ein http-Link auf eine unterwegs veränderbare.
  it("erzeugt immer absolute https-Links", async () => {
    for (const wert of [
      undefined,
      "",
      "  ",
      "https://beispiel.test/",
      "http://unsicher.test",
      "nicht-mal-eine-url",
      "//ohne-schema.test",
    ]) {
      const urls = await legalUrls(wert);
      for (const url of Object.values(urls)) {
        expect(url).toMatch(/^https:\/\/[^/]+\/legal\//);
      }
    }
  });

  // Ein versehentlicher Schrägstrich am Ende hätte sonst "//legal/agb"
  // ergeben — auf manchen Hosts eine andere Ressource, auf anderen ein 404.
  it("verträgt einen abschliessenden Schrägstrich in der Basis-URL", async () => {
    const urls = await legalUrls("https://beispiel.test///");
    expect(urls.impressum).toBe("https://beispiel.test/legal/impressum");
  });

  // Der frühere Wert war https://xyz.ch/… — eine Domain, die uns nicht
  // gehört, unter der Beschriftung "Impressum". Ein Test dagegen ist billig
  // und fängt ein versehentliches Zurückfallen ab.
  it("enthält nirgends die alte Platzhalter- oder Übergangsdomain", async () => {
    const urls = await legalUrls(undefined);
    for (const url of Object.values(urls)) {
      expect(url).not.toContain("xyz.ch");
      // Die vercel.app-Adresse war der Übergangswert, solange strado.ch
      // noch nicht auslieferte. Sie zeigt heute nicht mehr auf die
      // gepflegten Texte und darf nicht zurückfallen.
      expect(url).not.toContain("vercel.app");
      expect(url.startsWith("https://")).toBe(true);
    }
  });
});
