import { describe, expect, it } from "vitest";
import { baueSammlung, datumAnzeige, type PassStrecke } from "./passSammlung";

const klausen: PassStrecke = { id: "klausen", name: "Klausenpass", region: "UR · GL", hoehe_m: 1948 };
const pragel: PassStrecke = { id: "pragel", name: "Pragelpass", region: "SZ · GL", hoehe_m: 1550 };
const nufenen: PassStrecke = { id: "nufenen", name: "Nufenenpass", region: "VS · TI", hoehe_m: 2478 };
const ohneHoehe: PassStrecke = { id: "ibergeregg", name: "Ibergeregg", region: "SZ", hoehe_m: null };
const uebergang: PassStrecke = { id: "u", name: "Übergang", region: null, hoehe_m: null };

describe("baueSammlung", () => {
  it("zählt je Pass die Fahrten und merkt sich die erste", () => {
    const sammlung = baueSammlung(
      [klausen, pragel],
      [
        { pass_id: "klausen", datum: "2026-08-01" },
        { pass_id: "klausen", datum: "2026-06-14" },
        { pass_id: "klausen", datum: "2026-07-03" },
      ],
    );
    expect(sammlung.gefahren).toHaveLength(1);
    expect(sammlung.gefahren[0]).toMatchObject({ id: "klausen", anzahl: 3, ersteFahrt: "2026-06-14" });
    expect(sammlung.offen.map((p) => p.id)).toEqual(["pragel"]);
    expect(sammlung.anzahlGefahren).toBe(1);
    expect(sammlung.anzahlGesamt).toBe(2);
  });

  it("ordnet gefahrene Pässe nach der ersten Fahrt, nicht nach Höhe", () => {
    const sammlung = baueSammlung(
      [nufenen, klausen, pragel],
      [
        { pass_id: "nufenen", datum: "2026-09-01" },
        { pass_id: "pragel", datum: "2025-07-01" },
        { pass_id: "klausen", datum: "2026-05-30" },
      ],
    );
    expect(sammlung.gefahren.map((p) => p.id)).toEqual(["pragel", "klausen", "nufenen"]);
  });

  // Die Grundmenge ist der Katalog (0104). Eine Passfahrt zu einem Kürzel,
  // das nicht (mehr) im Katalog steht, darf weder Zähler noch Nenner
  // verändern — sonst stünde "3 von 2" da.
  it("ignoriert Passfahrten ausserhalb des Katalogs", () => {
    const sammlung = baueSammlung([klausen], [{ pass_id: "entfernter-pass", datum: "2026-07-01" }]);
    expect(sammlung.anzahlGefahren).toBe(0);
    expect(sammlung.anzahlGesamt).toBe(1);
  });

  it("zählt doppelte Zeilen der Grundmenge nur einmal", () => {
    const sammlung = baueSammlung([klausen, klausen], []);
    expect(sammlung.anzahlGesamt).toBe(1);
    expect(sammlung.offen).toHaveLength(1);
  });

  it("überspringt Fahrten mit unlesbarem Datum", () => {
    const sammlung = baueSammlung([klausen], [{ pass_id: "klausen", datum: "gestern" }]);
    expect(sammlung.anzahlGefahren).toBe(0);
  });

  it("sortiert offene Pässe nach Schweizer Alphabet (Ü bei U)", () => {
    const zett: PassStrecke = { id: "z", name: "Zeta", region: null, hoehe_m: null };
    const sammlung = baueSammlung([zett, uebergang, klausen], []);
    expect(sammlung.offen.map((p) => p.name)).toEqual(["Klausenpass", "Übergang", "Zeta"]);
  });

  it("findet den höchsten gefahrenen Pass und übergeht fehlende Höhen", () => {
    const sammlung = baueSammlung(
      [klausen, nufenen, ohneHoehe],
      [
        { pass_id: "klausen", datum: "2026-06-01" },
        { pass_id: "ibergeregg", datum: "2026-06-02" },
      ],
    );
    expect(sammlung.hoechsterPass?.id).toBe("klausen");
  });

  it("hat ohne Höhenangabe keinen höchsten Pass", () => {
    const sammlung = baueSammlung([ohneHoehe], [{ pass_id: "ibergeregg", datum: "2026-06-02" }]);
    expect(sammlung.hoechsterPass).toBeNull();
  });

  it("kommt mit einer leeren Grundmenge zurecht", () => {
    const sammlung = baueSammlung([], [{ pass_id: "klausen", datum: "2026-06-01" }]);
    expect(sammlung).toMatchObject({ anzahlGefahren: 0, anzahlGesamt: 0, hoechsterPass: null });
  });
});

describe("datumAnzeige", () => {
  it("formatiert ohne Zeitzonenumweg", () => {
    expect(datumAnzeige("2026-01-01")).toBe("01.01.2026");
  });

  it("lässt Unlesbares unverändert", () => {
    expect(datumAnzeige("irgendwann")).toBe("irgendwann");
  });
});
