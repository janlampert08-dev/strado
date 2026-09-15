import { describe, expect, it } from "vitest";
import { anzahlText, bewertungAusSternen, schnittText } from "@/lib/bewertungen";

describe("bewertungAusSternen", () => {
  it("mittelt die vergebenen Sterne", () => {
    expect(bewertungAusSternen([5, 4, 3])).toEqual({ schnitt: 4, anzahl: 3 });
  });

  it("gibt null zurück, wenn niemand Sterne vergeben hat", () => {
    expect(bewertungAusSternen([])).toBeNull();
    expect(bewertungAusSternen([null, null])).toBeNull();
  });

  // Der Kern: seit 0025 kann eine Bewertung aus einem blossen Kommentar
  // bestehen. Zählte man solche Zeilen in den Nenner, wäre jeder Kommentar
  // ohne Wertung eine Null-Wertung — eine Strecke mit fünf begeisterten
  // Kommentaren und einem 5-Sterne-Urteil stünde dann bei 0,8.
  it("zählt Zeilen ohne Sterne weder in den Zähler noch in den Nenner", () => {
    expect(bewertungAusSternen([5, null, null, null, null, null])).toEqual({
      schnitt: 5,
      anzahl: 1,
    });
  });

  it("rundet nicht selbst — das ist Sache der Anzeige", () => {
    const bewertung = bewertungAusSternen([4, 5]);
    expect(bewertung?.schnitt).toBe(4.5);
    const drittel = bewertungAusSternen([4, 4, 5]);
    expect(drittel?.schnitt).toBeCloseTo(4.333333, 5);
  });

  // Defensiv, aber nicht theoretisch: die Spalte ist erst seit 0095 wieder
  // durch einen Constraint gebunden, und Zeilen aus der Zeit davor sind
  // ungeprüft durch PostgREST schreibbar gewesen. NaN würde den ganzen
  // Schnitt zu NaN machen und die Anzeige auf jeder Karte zerstören.
  it("überspringt Werte, die keine Zahl sind", () => {
    expect(bewertungAusSternen([5, NaN, 3])).toEqual({ schnitt: 4, anzahl: 2 });
  });
});

describe("schnittText", () => {
  it("zeigt genau eine Nachkommastelle", () => {
    expect(schnittText(4)).toBe("4.0");
    expect(schnittText(4.25)).toBe("4.3");
    expect(schnittText(4.333333)).toBe("4.3");
  });

  // Die Schweiz trennt Dezimalstellen mit einem PUNKT, nicht mit einem
  // Komma — anders als Deutschland und Österreich. Wer die Anzeige einmal
  // auf de-DE oder ein handgeschriebenes toFixed().replace(".", ",")
  // umstellt, bricht hier auf.
  it("trennt schweizerisch mit Punkt, nicht deutsch mit Komma", () => {
    expect(schnittText(4.5)).not.toContain(",");
    expect(schnittText(4.5)).toBe("4.5");
  });
});

describe("anzahlText", () => {
  it("setzt den Singular bei genau einer Bewertung", () => {
    expect(anzahlText(1)).toBe("1 Bewertung");
    expect(anzahlText(0)).toBe("0 Bewertungen");
    expect(anzahlText(7)).toBe("7 Bewertungen");
  });
});
