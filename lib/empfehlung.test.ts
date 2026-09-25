import { describe, expect, it } from "vitest";
import {
  formatEntfernungKm,
  MINDEST_BEWERTUNGEN_FUER_BESTWERTUNG,
  waehleEmpfohleneStrecke,
} from "@/lib/empfehlung";

describe("waehleEmpfohleneStrecke", () => {
  const ids = ["a", "b", "c"];

  it("nimmt die bestbewertete, Gleichstand nach Anzahl", () => {
    expect(
      waehleEmpfohleneStrecke(ids, {
        a: { schnitt: 4.5, anzahl: 2 },
        b: { schnitt: 4.5, anzahl: 9 },
        c: { schnitt: 3.0, anzahl: 30 },
      }),
    ).toEqual({ id: "b", grund: "bewertung" });
  });

  it("fällt ohne Wertungen auf die erste Zeile zurück", () => {
    expect(waehleEmpfohleneStrecke(ids)).toEqual({ id: "a", grund: "bestand" });
  });

  it("empfiehlt nichts bei leerer Liste oder wenn alle ausgeschlossen sind", () => {
    expect(waehleEmpfohleneStrecke([])).toBeNull();
    expect(waehleEmpfohleneStrecke(ids, {}, { ausgeschlossen: new Set(ids) })).toBeNull();
  });

  it("schliesst ausgeschlossene Strecken aus", () => {
    expect(
      waehleEmpfohleneStrecke(ids, { b: { schnitt: 5.0, anzahl: 10 } }, { ausgeschlossen: new Set(["b"]) }),
    ).toEqual({ id: "a", grund: "bestand" });
  });

  it(`ignoriert Schnitte unter ${MINDEST_BEWERTUNGEN_FUER_BESTWERTUNG} Stimmen — keine Rausch-Empfehlung`, () => {
    // Eine einzelne 5.0 darf eine 4.8 aus fünfzig Stimmen nicht schlagen.
    expect(
      waehleEmpfohleneStrecke(["einzel", "viele"], {
        einzel: { schnitt: 5.0, anzahl: 1 },
        viele: { schnitt: 4.8, anzahl: 50 },
      }),
    ).toEqual({ id: "viele", grund: "bewertung" });
    // Nur Rauschen im Bestand: ehrlicher Fallback ohne "bestbewertet".
    expect(
      waehleEmpfohleneStrecke(ids, {
        a: { schnitt: 5.0, anzahl: 1 },
        b: { schnitt: 4.0, anzahl: 2 },
      }),
    ).toEqual({ id: "a", grund: "bestand" });
  });

  it("ignoriert defekte Wertungen", () => {
    expect(
      waehleEmpfohleneStrecke(["kaputt", "gut"], {
        kaputt: { schnitt: NaN, anzahl: 10 },
        gut: { schnitt: 4.0, anzahl: 5 },
      }),
    ).toEqual({ id: "gut", grund: "bewertung" });
    expect(
      waehleEmpfohleneStrecke(["ausserhalb", "gut"], {
        ausserhalb: { schnitt: 9999, anzahl: 10 },
        gut: { schnitt: 4.0, anzahl: 5 },
      }),
    ).toEqual({ id: "gut", grund: "bewertung" });
    expect(
      waehleEmpfohleneStrecke(["null", "gut"], {
        null: { schnitt: 5.0, anzahl: 0 },
        gut: { schnitt: 4.0, anzahl: 5 },
      }),
    ).toEqual({ id: "gut", grund: "bewertung" });
  });
});

describe("formatEntfernungKm", () => {
  it("rundet und nennt kurze Distanzen ehrlich", () => {
    expect(formatEntfernungKm(12.4)).toBe("12\u00a0km");
    expect(formatEntfernungKm(0.4)).toBe("weniger als 1\u00a0km");
    expect(formatEntfernungKm(NaN)).toBe("—");
  });
});
