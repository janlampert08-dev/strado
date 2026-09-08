import { describe, it, expect } from "vitest";
import { summiereHoehenmeter } from "./hoehenmeter";

describe("summiereHoehenmeter", () => {
  it("summiert den Anstieg über alle Fahrten", () => {
    expect(
      summiereHoehenmeter([
        { hoehenmeter_aufstieg: 1200 },
        { hoehenmeter_aufstieg: 340 },
        { hoehenmeter_aufstieg: 0 },
      ]),
    ).toBe(1540);
  });

  it("zählt dieselbe Strecke bei jeder Befahrung erneut", () => {
    // Der Unterschied zur alten, streckenbezogenen Rechnung: der Anstieg
    // gehört zur Fahrt. Zehnmal derselbe Pass sind zehnmal der Anstieg —
    // und nicht mehr wahlweise einmal (eigenes Profil) oder zehnmal die
    // Scheitelhöhe (öffentliches Profil).
    const fahrt = { hoehenmeter_aufstieg: 1150 };
    expect(summiereHoehenmeter(Array(10).fill(fahrt))).toBe(11500);
  });

  it("zählt Fahrten ohne Höhendaten als 0 statt sie zu schätzen", () => {
    // null heisst: swisstopo hat nichts geliefert (ausserhalb der Schweiz
    // oder Ausfall) oder die Fahrt ist älter als 0044. Wie sum() in der
    // Bestenliste (0056) fällt der Wert einfach raus.
    expect(
      summiereHoehenmeter([
        { hoehenmeter_aufstieg: 800 },
        { hoehenmeter_aufstieg: null },
        { hoehenmeter_aufstieg: null },
      ]),
    ).toBe(800);
  });

  it("liefert 0 für eine leere Liste", () => {
    expect(summiereHoehenmeter([])).toBe(0);
  });

  it("rundet auf ganze Meter", () => {
    // numeric-Spalte: eine direkt geschriebene Zeile muss keine Ganzzahl
    // tragen, die Kachel soll trotzdem keine Nachkommastellen zeigen.
    expect(
      summiereHoehenmeter([{ hoehenmeter_aufstieg: 12.4 }, { hoehenmeter_aufstieg: 30.3 }]),
    ).toBe(43);
  });
});
