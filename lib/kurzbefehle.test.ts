import { describe, expect, it } from "vitest";
import { KURZBEFEHLE, kurzbefehl, kurzbefehlGlypheUri } from "./kurzbefehle";

describe("kurzbefehle", () => {
  it("führt die beiden Verknüpfungen aus dem Manifest", () => {
    expect(KURZBEFEHLE.map((k) => [k.name, k.url])).toEqual([
      ["Fahrt aufzeichnen", "/fahrten/neu"],
      ["Pässe", "/paesse"],
    ]);
  });

  it("hat eindeutige, URL-taugliche Arten", () => {
    const arten = KURZBEFEHLE.map((k) => k.art);
    expect(new Set(arten).size).toBe(arten.length);
    for (const art of arten) expect(art).toMatch(/^[a-z]+$/);
  });

  it("kennt nur Arten aus der Tabelle", () => {
    expect(kurzbefehl("paesse")?.url).toBe("/paesse");
    expect(kurzbefehl("../geheim")).toBeNull();
    expect(kurzbefehl(null)).toBeNull();
  });

  it("baut ein gültiges SVG-Dokument als data:-URI", () => {
    const uri = kurzbefehlGlypheUri(KURZBEFEHLE[0], "#fafafa");
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('stroke="#fafafa"');
  });
});
