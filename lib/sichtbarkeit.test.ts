import { describe, it, expect } from "vitest";
import {
  sichtbarkeitAus,
  sichtbarkeitAusFormular,
  sichtbarkeitSpalten,
  SICHTBARKEITEN,
} from "./sichtbarkeit";

function formular(felder: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(felder)) fd.set(k, v);
  return fd;
}

describe("sichtbarkeitAus", () => {
  it("liest die drei Stufen", () => {
    expect(sichtbarkeitAus({ ist_oeffentlich: false, fuer_follower: false })).toBe("privat");
    expect(sichtbarkeitAus({ ist_oeffentlich: false, fuer_follower: true })).toBe("follower");
    expect(sichtbarkeitAus({ ist_oeffentlich: true, fuer_follower: false })).toBe("oeffentlich");
  });

  it("gilt ohne fuer_follower-Spalte wie vor 0140", () => {
    expect(sichtbarkeitAus({ ist_oeffentlich: false })).toBe("privat");
    expect(sichtbarkeitAus({ ist_oeffentlich: true, fuer_follower: null })).toBe("oeffentlich");
  });

  it("lässt öffentlich gewinnen, falls beide gesetzt wären", () => {
    expect(sichtbarkeitAus({ ist_oeffentlich: true, fuer_follower: true })).toBe("oeffentlich");
  });
});

describe("sichtbarkeitSpalten", () => {
  it("setzt nie beide Spalten", () => {
    for (const s of SICHTBARKEITEN) {
      const spalten = sichtbarkeitSpalten(s);
      expect(spalten.ist_oeffentlich && spalten.fuer_follower).toBe(false);
      expect(sichtbarkeitAus(spalten)).toBe(s);
    }
  });
});

describe("sichtbarkeitAusFormular", () => {
  it("nimmt das neue Feld", () => {
    expect(sichtbarkeitAusFormular(formular({ sichtbarkeit: "follower" }))).toBe("follower");
    expect(
      sichtbarkeitAusFormular(formular({ sichtbarkeit: "privat", ist_oeffentlich: "true" })),
    ).toBe("privat");
  });

  it("fällt für alte Formulare auf ist_oeffentlich zurück", () => {
    expect(sichtbarkeitAusFormular(formular({ ist_oeffentlich: "true" }))).toBe("oeffentlich");
    expect(sichtbarkeitAusFormular(formular({ ist_oeffentlich: "false" }))).toBe("privat");
    expect(sichtbarkeitAusFormular(formular({}))).toBe("privat");
  });

  it("ignoriert unbekannte Werte", () => {
    expect(sichtbarkeitAusFormular(formular({ sichtbarkeit: "alle" }))).toBe("privat");
  });
});
