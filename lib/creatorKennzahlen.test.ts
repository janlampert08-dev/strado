import { describe, it, expect } from "vitest";
import {
  anteil,
  balkenHoehe,
  summiere,
  verlaufNachCode,
  type CreatorKennzahl,
  type CreatorVerlaufTag,
} from "./creatorKennzahlen";

function kennzahl(teil: Partial<CreatorKennzahl>): CreatorKennzahl {
  return {
    code: "max",
    name: "Max Muster",
    kanal: "tiktok",
    kampagne: null,
    aktiv: true,
    klicks: 0,
    registrierungen: 0,
    abos: 0,
    abosBeendet: 0,
    ...teil,
  };
}

function tag(code: string, datum: string, klicks: number): CreatorVerlaufTag {
  return { code, tag: datum, klicks };
}

describe("summiere", () => {
  it("zählt über alle Codes zusammen", () => {
    const summe = summiere([
      kennzahl({ code: "max", klicks: 120, registrierungen: 9, abos: 2, abosBeendet: 1 }),
      kennzahl({ code: "lea", klicks: 40, registrierungen: 3, abos: 1, abosBeendet: 0 }),
    ]);
    expect(summe).toEqual({ klicks: 160, registrierungen: 12, abos: 3, abosBeendet: 1 });
  });

  it("liefert für keine Codes lauter Nullen statt undefined", () => {
    expect(summiere([])).toEqual({ klicks: 0, registrierungen: 0, abos: 0, abosBeendet: 0 });
  });
});

describe("anteil", () => {
  it("rechnet auf eine Nachkommastelle", () => {
    expect(anteil(12, 160)).toBe(7.5);
    expect(anteil(1, 3)).toBe(33.3);
  });

  // "0 %" bei null Klicks behauptet ein Ergebnis, wo gar nicht gemessen
  // wurde — die Oberfläche soll dann einen Strich zeigen, keine Zahl.
  it("gibt ohne Nenner null zurück", () => {
    expect(anteil(0, 0)).toBeNull();
    expect(anteil(5, 0)).toBeNull();
    expect(anteil(5, -1)).toBeNull();
  });

  it("verträgt kaputte Eingaben", () => {
    expect(anteil(Number.NaN, 10)).toBeNull();
    expect(anteil(1, Number.NaN)).toBeNull();
  });
});

describe("balkenHoehe", () => {
  it("skaliert auf den Höchstwert", () => {
    expect(balkenHoehe(50, 100)).toBe(50);
    expect(balkenHoehe(100, 100)).toBe(100);
  });

  // Ein einzelner Klick neben einem Ausreisser wäre sonst optisch dasselbe
  // wie ein Tag ohne jeden Klick. Die Untergrenze muss dafür über dem
  // 2-px-Strich liegen, mit dem ein leerer Tag gezeichnet wird: auf der
  // 48 px hohen Bahn sind 10 % = 4.8 px, die alten 4 % waren 1.92 px und
  // damit niedriger als "gar nichts".
  it("hält einen Tag mit Bewegung sichtbar", () => {
    expect(balkenHoehe(1, 500)).toBe(10);
    expect(balkenHoehe(1, 500) * 0.48).toBeGreaterThan(2);
  });

  it("lässt einen leeren Tag leer", () => {
    expect(balkenHoehe(0, 500)).toBe(0);
    expect(balkenHoehe(0, 0)).toBe(0);
    expect(balkenHoehe(3, 0)).toBe(0);
  });
});

describe("verlaufNachCode", () => {
  it("gruppiert und behält die Reihenfolge je Code", () => {
    const reihen = verlaufNachCode([
      tag("max", "2026-09-01", 3),
      tag("lea", "2026-09-01", 1),
      tag("max", "2026-09-02", 7),
      tag("lea", "2026-09-02", 0),
    ]);

    expect(reihen.map((r) => r.code)).toEqual(["max", "lea"]);
    expect(reihen[0].tage.map((t) => t.tag)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(reihen[1].tage).toHaveLength(2);
  });

  // Pro Code skaliert und nicht global: sonst drückt ein Creator mit tausend
  // Klicks jeden anderen zu einer leeren Linie zusammen.
  it("merkt sich den Höchstwert je Reihe", () => {
    const reihen = verlaufNachCode([
      tag("max", "2026-09-01", 900),
      tag("max", "2026-09-02", 100),
      tag("lea", "2026-09-01", 4),
    ]);
    expect(reihen.find((r) => r.code === "max")?.hoechstwert).toBe(900);
    expect(reihen.find((r) => r.code === "lea")?.hoechstwert).toBe(4);
  });

  it("kommt mit einem leeren Verlauf klar", () => {
    expect(verlaufNachCode([])).toEqual([]);
  });
});
