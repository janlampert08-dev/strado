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
  it("zeigt ohne Umgebungsvariable auf die Marketing-Domain", async () => {
    expect(await legalUrls(undefined)).toEqual({
      impressum: "https://cornice.ch/legal/impressum",
      datenschutz: "https://cornice.ch/legal/datenschutz",
      agb: "https://cornice.ch/legal/agb",
    });
  });

  it("übernimmt eine gesetzte Basis-URL", async () => {
    const urls = await legalUrls("https://cornice-ch.vercel.app");
    expect(urls.agb).toBe("https://cornice-ch.vercel.app/legal/agb");
  });

  // Ein versehentlicher Schrägstrich am Ende hätte sonst "//legal/agb"
  // ergeben — auf manchen Hosts eine andere Ressource, auf anderen ein 404.
  it("verträgt einen abschliessenden Schrägstrich in der Basis-URL", async () => {
    const urls = await legalUrls("https://cornice.ch///");
    expect(urls.impressum).toBe("https://cornice.ch/legal/impressum");
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
