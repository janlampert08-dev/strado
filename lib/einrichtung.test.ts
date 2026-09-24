import { describe, expect, it } from "vitest";
import {
  EINRICHTUNG_META_SCHLUESSEL,
  istEinrichtungErledigt,
  passVorschlaege,
  zielNachEinrichtung,
} from "@/lib/einrichtung";

describe("istEinrichtungErledigt", () => {
  it("gilt erst mit einem gesetzten Zeitpunkt als erledigt", () => {
    expect(istEinrichtungErledigt({ [EINRICHTUNG_META_SCHLUESSEL]: "2026-09-23T12:00:00.000Z" })).toBe(true);
    expect(istEinrichtungErledigt({ display_name: "Jan" })).toBe(false);
    expect(istEinrichtungErledigt({ [EINRICHTUNG_META_SCHLUESSEL]: "" })).toBe(false);
    expect(istEinrichtungErledigt({ [EINRICHTUNG_META_SCHLUESSEL]: true })).toBe(false);
    expect(istEinrichtungErledigt(null)).toBe(false);
    expect(istEinrichtungErledigt(undefined)).toBe(false);
  });
});

describe("zielNachEinrichtung", () => {
  it("übernimmt ein internes Ziel", () => {
    expect(zielNachEinrichtung("/paesse#furka")).toBe("/paesse#furka");
  });

  it("fällt ohne oder mit fremdem Ziel auf die Startseite zurück", () => {
    expect(zielNachEinrichtung(undefined)).toBe("/");
    expect(zielNachEinrichtung("https://evil.example")).toBe("/");
    expect(zielNachEinrichtung("//evil.example")).toBe("/");
  });

  it("schickt nie zurück in die Einrichtung selbst", () => {
    expect(zielNachEinrichtung("/einrichten")).toBe("/");
    expect(zielNachEinrichtung("/einrichten?next=/einrichten")).toBe("/");
  });
});

describe("passVorschlaege", () => {
  const pass = (id: string, hoeheM: number, hatStrecke: boolean) => ({
    id,
    name: id,
    hoeheM,
    hatStrecke,
    folgtMan: false,
  });

  it("stellt Pässe mit Strecke vor die übrigen, dann nach Höhe", () => {
    const ergebnis = passVorschlaege([
      pass("umbrail", 2501, false),
      pass("klausen", 1948, true),
      pass("furka", 2429, true),
    ]);
    expect(ergebnis.map((p) => p.id)).toEqual(["furka", "klausen", "umbrail"]);
  });

  it("kürzt auf die gewünschte Anzahl und lässt die Eingabe unverändert", () => {
    const eingabe = [pass("a", 1000, false), pass("b", 2000, false), pass("c", 1500, false)];
    expect(passVorschlaege(eingabe, 2).map((p) => p.id)).toEqual(["b", "c"]);
    expect(eingabe.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});
