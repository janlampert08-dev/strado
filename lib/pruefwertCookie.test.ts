import { describe, expect, it } from "vitest";
import { PRUEFWERT_KENNUNG, hatPruefwert } from "@/lib/pruefwertCookie";

// Nur die reine Entscheidung ist hier prüfbar — warteAufPruefwert() hängt an
// next/headers und damit an einem Anfrage-Kontext, den Vitest (environment
// "node", siehe AGENTS.md) nicht stellt.
describe("hatPruefwert", () => {
  it("erkennt den Prüfwert unabhängig von der Projekt-Referenz", () => {
    // Der Name trägt die Projekt-Referenz, die je Umgebung anders lautet.
    expect(hatPruefwert(["sb-stecakpnuijbvjsniqto-auth-token-code-verifier"])).toBe(true);
    expect(hatPruefwert(["sb-eineandere-auth-token-code-verifier"])).toBe(true);
  });

  it("erkennt ihn auch neben anderen Cookies", () => {
    expect(
      hatPruefwert([
        "strado_herkunft",
        "sb-abc-auth-token-flows-code-verifier",
        "irgendwas",
      ]),
    ).toBe(true);
  });

  it("meldet ihn nicht, wenn nur die Sitzungs-Cookies stehen", () => {
    // Der Fall, der die Wartezeit überhaupt nötig macht: die Sitzung ist da,
    // der Prüfwert noch nicht.
    expect(hatPruefwert(["sb-abc-auth-token", "sb-abc-auth-token.0"])).toBe(false);
    expect(hatPruefwert([])).toBe(false);
  });

  it("nennt die Kennung, auf die es ankommt", () => {
    expect(PRUEFWERT_KENNUNG).toBe("code-verifier");
  });
});
