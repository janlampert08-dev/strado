import { describe, expect, it } from "vitest";
import {
  baueSammlung,
  datumAnzeige,
  zaehleGefahrenePaesse,
  type PassStrecke,
} from "./passSammlung";

const klausen: PassStrecke = { id: "klausen", name: "Klausenpass", region: "Uri", hoehe_m: 1948 };
const pragel: PassStrecke = { id: "pragel", name: "Pragelpass", region: "Schwyz", hoehe_m: 1550 };
const nufenen: PassStrecke = { id: "nufenen", name: "Nufenenpass", region: "Wallis", hoehe_m: 2478 };
const ohneHoehe: PassStrecke = { id: "ibergeregg", name: "Ibergeregg", region: "Schwyz", hoehe_m: null };
const uebergang: PassStrecke = { id: "u", name: "Übergang", region: null, hoehe_m: null };

describe("baueSammlung", () => {
  it("zählt je Pass die Fahrten und merkt sich die erste", () => {
    const sammlung = baueSammlung(
      [klausen, pragel],
      [
        { route_id: "klausen", datum: "2026-08-01" },
        { route_id: "klausen", datum: "2026-06-14" },
        { route_id: "klausen", datum: "2026-07-03" },
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
        { route_id: "nufenen", datum: "2026-09-01" },
        { route_id: "pragel", datum: "2025-07-01" },
        { route_id: "klausen", datum: "2026-05-30" },
      ],
    );
    expect(sammlung.gefahren.map((p) => p.id)).toEqual(["pragel", "klausen", "nufenen"]);
  });

  // Die Grundmenge ist die öffentliche Liste. Eine Fahrt auf einer Strecke
  // ausserhalb (privat, abgelehnt, keine Passstrasse) darf weder den Zähler
  // noch den Nenner verändern — sonst stünde "3 von 2" da.
  it("ignoriert Fahrten ausserhalb der Grundmenge und freie Fahrten", () => {
    const sammlung = baueSammlung(
      [klausen],
      [
        { route_id: "privater-pass", datum: "2026-07-01" },
        { route_id: null, datum: "2026-07-02" },
      ],
    );
    expect(sammlung.anzahlGefahren).toBe(0);
    expect(sammlung.anzahlGesamt).toBe(1);
  });

  it("zählt doppelte Zeilen der Grundmenge nur einmal", () => {
    const sammlung = baueSammlung([klausen, klausen], []);
    expect(sammlung.anzahlGesamt).toBe(1);
    expect(sammlung.offen).toHaveLength(1);
  });

  it("überspringt Fahrten mit unlesbarem Datum", () => {
    const sammlung = baueSammlung([klausen], [{ route_id: "klausen", datum: "gestern" }]);
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
        { route_id: "klausen", datum: "2026-06-01" },
        { route_id: "ibergeregg", datum: "2026-06-02" },
      ],
    );
    expect(sammlung.hoechsterPass?.id).toBe("klausen");
  });

  it("hat ohne Höhenangabe keinen höchsten Pass", () => {
    const sammlung = baueSammlung([ohneHoehe], [{ route_id: "ibergeregg", datum: "2026-06-02" }]);
    expect(sammlung.hoechsterPass).toBeNull();
  });

  it("kommt mit einer leeren Grundmenge zurecht", () => {
    const sammlung = baueSammlung([], [{ route_id: "klausen", datum: "2026-06-01" }]);
    expect(sammlung).toMatchObject({ anzahlGefahren: 0, anzahlGesamt: 0, hoechsterPass: null });
  });
});

describe("zaehleGefahrenePaesse", () => {
  it("zählt verschiedene Pässe aus der Grundmenge, jede Strecke einmal", () => {
    expect(
      zaehleGefahrenePaesse(
        ["klausen", "pragel"],
        [{ route_id: "klausen" }, { route_id: "klausen" }, { route_id: "anderswo" }, { route_id: null }],
      ),
    ).toBe(1);
  });

  it("stimmt mit baueSammlung überein", () => {
    const fahrten = [
      { route_id: "klausen", datum: "2026-06-01" },
      { route_id: "pragel", datum: "2026-06-02" },
    ];
    const paesse = [klausen, pragel, nufenen];
    expect(zaehleGefahrenePaesse(paesse.map((p) => p.id), fahrten)).toBe(
      baueSammlung(paesse, fahrten).anzahlGefahren,
    );
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
