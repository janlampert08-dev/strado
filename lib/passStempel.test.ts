import { describe, expect, it } from "vitest";
import { hatStempelSpalte } from "./passStempel";

const befahren = { gefahren: { erstmals: "2026-09-01", fahrten: 1 } };
const offen = { gefahren: null };

describe("hatStempelSpalte", () => {
  it("Gäste bekommen nie eine Stempelspalte", () => {
    expect(hatStempelSpalte(false, [offen, offen])).toBe(false);
    // Auch nicht, wenn (theoretisch) Daten mitkämen.
    expect(hatStempelSpalte(false, [befahren])).toBe(false);
  });

  it("angemeldet ohne einen befahrenen Pass: keine Spalte", () => {
    expect(hatStempelSpalte(true, [offen, offen, offen])).toBe(false);
    expect(hatStempelSpalte(true, [])).toBe(false);
  });

  it("angemeldet mit mindestens einem befahrenen Pass: Spalte", () => {
    expect(hatStempelSpalte(true, [offen, befahren, offen])).toBe(true);
  });
});
