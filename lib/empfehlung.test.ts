import { describe, expect, it } from "vitest";
import { formatEntfernungKm, waehleEmpfohleneStrecke } from "@/lib/empfehlung";

describe("waehleEmpfohleneStrecke", () => {
  const ids = ["a", "b", "c"];

  it("nimmt mit Standort die erste (nächste) Strecke", () => {
    expect(
      waehleEmpfohleneStrecke(ids, { hatStandort: true, searchQuery: "" }),
    ).toEqual({ id: "a", grund: "naehe" });
  });

  it("nimmt ohne Standort die bestbewertete, Gleichstand nach Anzahl", () => {
    expect(
      waehleEmpfohleneStrecke(ids, {
        hatStandort: false,
        searchQuery: "",
        bewertungen: {
          a: { schnitt: 4.5, anzahl: 2 },
          b: { schnitt: 4.5, anzahl: 9 },
          c: { schnitt: 3.0, anzahl: 30 },
        },
      }),
    ).toEqual({ id: "b", grund: "bewertung" });
  });

  it("fällt ohne Wertungen auf die erste Zeile zurück", () => {
    expect(
      waehleEmpfohleneStrecke(ids, { hatStandort: false, searchQuery: "" }),
    ).toEqual({ id: "a", grund: "bestand" });
  });

  it("empfiehlt nichts bei Suche, Fehler oder leerer Liste", () => {
    expect(
      waehleEmpfohleneStrecke(ids, { hatStandort: true, searchQuery: "klausen" }),
    ).toBeNull();
    expect(
      waehleEmpfohleneStrecke(ids, { hatStandort: true, searchQuery: "", loadError: true }),
    ).toBeNull();
    expect(
      waehleEmpfohleneStrecke([], { hatStandort: false, searchQuery: "" }),
    ).toBeNull();
  });
});

describe("formatEntfernungKm", () => {
  it("rundet und nennt kurze Distanzen ehrlich", () => {
    expect(formatEntfernungKm(12.4)).toBe("12 km");
    expect(formatEntfernungKm(0.4)).toBe("weniger als 1 km");
    expect(formatEntfernungKm(NaN)).toBe("—");
  });
});
