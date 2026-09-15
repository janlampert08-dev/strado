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

  // Der Fall, den die erste Fassung durchgelassen hat: 9999 ist eine
  // vollkommen endliche Zahl. Der Constraint aus 0095 ist `not valid`, die
  // Altzeilen sind also ungeprüft, und route_ratings ist über PostgREST
  // direkt beschreibbar — ein solcher Wert wäre in den öffentlich
  // angezeigten Schnitt, in aggregateRating und in die Explore-Liste
  // eingegangen. Endlichkeit allein genügt hier nicht, die Spannweite
  // entscheidet.
  it("überspringt Werte ausserhalb der Skala", () => {
    expect(bewertungAusSternen([5, 9999, 3])).toEqual({ schnitt: 4, anzahl: 2 });
    expect(bewertungAusSternen([0, 5])).toEqual({ schnitt: 5, anzahl: 1 });
    expect(bewertungAusSternen([-3, 4])).toEqual({ schnitt: 4, anzahl: 1 });
  });

  // Aussortiert, nicht gekappt: ein manipulierter Wert darf nicht als
  // Bestnote durchgehen. Bliebe 9999 als 5 stehen, hätte das Schreiben des
  // falschen Werts genau das erreicht, was es erreichen wollte.
  it("kappt einen zu grossen Wert nicht auf 5, sondern wirft ihn weg", () => {
    expect(bewertungAusSternen([9999])).toBeNull();
    expect(bewertungAusSternen([1, 9999])).toEqual({ schnitt: 1, anzahl: 1 });
  });

  // Die Ränder gehören dazu — eine Skala von 1 bis 5 schliesst 1 und 5 ein.
  it("behält die Randwerte 1 und 5", () => {
    expect(bewertungAusSternen([1, 5])).toEqual({ schnitt: 3, anzahl: 2 });
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
