import { describe, expect, it } from "vitest";
import { gleicheStreckentextAb, type StreckenKennzahlen } from "./streckentextAbgleich";

// Texte und Kennzahlen wörtlich aus der Produktionsdatenbank (2026-09-25).
const AECHERLI: StreckenKennzahlen = { laengeKm: 19.93, hoeheM: 1456, maxSteigungProzent: 12.8, kehren: 37 };
const RATEN: StreckenKennzahlen = { laengeKm: 11.48, hoeheM: 1077, maxSteigungProzent: 7.7, kehren: 5 };

describe("gleicheStreckentextAb — die zwei Fälle, die 0140 bereinigt", () => {
  it("meldet die 16 Prozent am Ächerlipass (Kachel: 12.8 %)", () => {
    const befunde = gleicheStreckentextAb(
      "Von Kerns über das Ächerli nach Dallenwil, rund 20 km. Die Strasse ist meist einspurig mit Ausweichstellen und steigt bis zu 16 Prozent. Unterwegs sieht man Pilatus, Rigi, Stanserhorn und Titlis.",
      AECHERLI,
    );
    expect(befunde).toEqual([{ art: "steigung", textstelle: "16 Prozent", imText: 16, gerechnet: 12.8 }]);
  });

  it("meldet die 9 Prozent am Ratenpass (Kachel: 7.7 %)", () => {
    const befunde = gleicheStreckentextAb(
      "Von Oberägeri über den Raten (1077 m) nach Biberbrugg, rund 11 km. Die Steigung erreicht bis zu 9 Prozent.",
      RATEN,
    );
    expect(befunde.map((b) => b.art)).toEqual(["steigung"]);
  });

  it("die neuen Texte aus 0140 sind sauber", () => {
    expect(
      gleicheStreckentextAb(
        "Von Kerns über das Ächerli nach Dallenwil, rund 20 km. Die Strasse ist meist einspurig mit Ausweichstellen und stellenweise sehr steil. Unterwegs sieht man Pilatus, Rigi, Stanserhorn und Titlis.",
        AECHERLI,
      ),
    ).toEqual([]);
    expect(
      gleicheStreckentextAb(
        "Von Oberägeri über den Raten (1077 m) nach Biberbrugg, rund 11 km. Die Steigung bleibt meist moderat.",
        RATEN,
      ),
    ).toEqual([]);
  });
});

describe("gleicheStreckentextAb — was stimmt, bleibt still", () => {
  it("Passhöhe unter dem höchsten Punkt des Tracks ist kein Widerspruch (Schwägalp)", () => {
    expect(
      gleicheStreckentextAb(
        "Von Neu St. Johann im Toggenburg über die Schwägalp nach Urnäsch, rund 21 km. Bei der Passhöhe (1278 m) fährt die Luftseilbahn auf den Säntis.",
        { laengeKm: 20.93, hoeheM: 1299, maxSteigungProzent: 10, kehren: 5 },
      ),
    ).toEqual([]);
  });

  it("gerundete Länge und Höhe (Etzelpass, Gurnigelpass)", () => {
    expect(
      gleicheStreckentextAb(
        "Die alte Pilgerstrasse von Pfäffikon SZ über den Etzel (950 m) nach Einsiedeln, rund 11 km.",
        { laengeKm: 11.24, hoeheM: 949, maxSteigungProzent: 13.6, kehren: 9 },
      ),
    ).toEqual([]);
    expect(
      gleicheStreckentextAb(
        "Von Riggisberg über Gurnigelbad und die Stierenhütte (1610 m) nach Schwarzsee, rund 30 km.",
        { laengeKm: 30.44, hoeheM: 1610, maxSteigungProzent: 10.5, kehren: 21 },
      ),
    ).toEqual([]);
  });

  it("eine kleinere Steigung im Text ist kein Widerspruch zum Maximum", () => {
    expect(gleicheStreckentextAb("Lange Abschnitte mit 8 %.", { ...AECHERLI })).toEqual([]);
  });

  it("ohne Text, ohne Befund", () => {
    expect(gleicheStreckentextAb(null, AECHERLI)).toEqual([]);
    expect(gleicheStreckentextAb("", AECHERLI)).toEqual([]);
  });
});

describe("gleicheStreckentextAb — Formen", () => {
  it("liest Apostroph-Tausender und Dezimalkomma", () => {
    const befunde = gleicheStreckentextAb("Oben auf 2'480 m, stellenweise 14,5 %.", {
      laengeKm: 10,
      hoeheM: 2100,
      maxSteigungProzent: 10,
      kehren: null,
    });
    expect(befunde).toEqual([
      { art: "steigung", textstelle: "14,5 %", imText: 14.5, gerechnet: 10 },
      { art: "hoehe", textstelle: "2'480 m", imText: 2480, gerechnet: 2100 },
    ]);
  });

  it("meldet falsche Länge und Kehrenzahl", () => {
    const befunde = gleicheStreckentextAb("Rund 40 km mit 60 Kehren.", {
      laengeKm: 23.4,
      hoeheM: null,
      maxSteigungProzent: null,
      kehren: 23,
    });
    expect(befunde.map((b) => b.art)).toEqual(["laenge", "kehren"]);
  });

  it("hält kleine Meterangaben nicht für Höhen", () => {
    expect(
      gleicheStreckentextAb("Nach 200 m links abbiegen.", { laengeKm: 5, hoeheM: 1500, maxSteigungProzent: 8, kehren: 2 }),
    ).toEqual([]);
  });
});
