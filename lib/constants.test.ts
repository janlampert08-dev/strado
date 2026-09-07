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
    // Bewusst die vercel.app-Adresse und keine Wunschdomain: eine noch nicht
    // registrierte Domain als Standard wäre derselbe Fehler wie das frühere
    // xyz.ch — sie kann jemand anderem gehören.
    expect(await legalUrls(undefined)).toEqual({
      impressum: "https://cornice-ch.vercel.app/legal/impressum",
      datenschutz: "https://cornice-ch.vercel.app/legal/datenschutz",
      agb: "https://cornice-ch.vercel.app/legal/agb",
    });
  });

  it("übernimmt eine gesetzte Basis-URL", async () => {
    const urls = await legalUrls("https://cornice.ch");
    expect(urls.agb).toBe("https://cornice.ch/legal/agb");
  });

  // .env.local.example führt NEXT_PUBLIC_LEGAL_BASE_URL ohne Wert. Eine
  // daraus kopierte Datei liefert einen leeren String, und ?? hätte den
  // erhalten: LEGAL_BASE_URL wäre "" und aus den Links würden relative
  // Pfade. Die zeigen dann auf die App-Domain, wo es keine Rechtstexte gibt.
  it("behandelt einen leeren Wert wie eine nicht gesetzte Variable", async () => {
    const urls = await legalUrls("");
    expect(urls.impressum).toBe("https://cornice-ch.vercel.app/legal/impressum");
  });

  it("behandelt auch reinen Leerraum wie nicht gesetzt", async () => {
    const urls = await legalUrls("   ");
    expect(urls.impressum).toBe("https://cornice-ch.vercel.app/legal/impressum");
  });

  // Die eigentliche Zusicherung hinter den beiden Fällen oben: die Links
  // sind IMMER absolut. Ein relativer Rechtstext-Link ist kein Schönheits-
  // fehler, sondern zeigt auf die falsche Seite.
  it("erzeugt immer absolute Links", async () => {
    for (const wert of [undefined, "", "  ", "https://beispiel.test/"]) {
      const urls = await legalUrls(wert);
      for (const url of Object.values(urls)) {
        expect(url).toMatch(/^https:\/\/[^/]+\/legal\//);
      }
    }
  });

  // Ein versehentlicher Schrägstrich am Ende hätte sonst "//legal/agb"
  // ergeben — auf manchen Hosts eine andere Ressource, auf anderen ein 404.
  it("verträgt einen abschliessenden Schrägstrich in der Basis-URL", async () => {
    const urls = await legalUrls("https://cornice-ch.vercel.app///");
    expect(urls.impressum).toBe("https://cornice-ch.vercel.app/legal/impressum");
  });

  // Der frühere Wert war https://xyz.ch/… — eine Domain, die uns nicht
  // gehört, unter der Beschriftung "Impressum". Ein Test dagegen ist billig
  // und fängt ein versehentliches Zurückfallen ab.
  it("enthält nirgends die alte Platzhalter-Domain", async () => {
    const urls = await legalUrls(undefined);
    for (const url of Object.values(urls)) {
      expect(url).not.toContain("xyz.ch");
      expect(url.startsWith("https://")).toBe(true);
    }
  });
});
