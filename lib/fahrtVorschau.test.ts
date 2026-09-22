import { describe, expect, it } from "vitest";
import { berechneFlugTabelle, positionBei } from "@/lib/fahrtVorschau";

// Gerade Linie: 10 km exakt nach Norden (0.01° ≈ 1.11 km je Schritt).
function gerade(km: number, schritte = 10): [number, number][] {
  const punkte: [number, number][] = [];
  for (let i = 0; i <= schritte; i++) punkte.push([8, 47 + (km / 111.32 / schritte) * i]);
  return punkte;
}

describe("berechneFlugTabelle", () => {
  it("gibt bei weniger als zwei Punkten nichts zurück", () => {
    expect(berechneFlugTabelle([])).toEqual([]);
    expect(berechneFlugTabelle([[8, 47]])).toEqual([]);
  });

  it("fährt geradeaus annähernd volles Tempo", () => {
    const tabelle = berechneFlugTabelle(gerade(9));
    const letzte = tabelle[tabelle.length - 1];
    // 9 km bei 900 m/s ≈ 10 s.
    expect(letzte.zeit).toBeGreaterThan(8);
    expect(letzte.zeit).toBeLessThan(13);
    expect(letzte.dist).toBeCloseTo(9000, -2);
  });

  it("bremst in der Kehre gegenüber der Geraden", () => {
    // Gleiche Beinlänge, einmal gerade, einmal mit 180°-Kehre in der Mitte.
    const geradeaus = berechneFlugTabelle(gerade(4, 4));
    const kehre = berechneFlugTabelle([
      [8, 47],
      [8, 47.018],
      [8.0005, 47.018],
      [8.0005, 47.0],
    ]);
    const zeitGerade = geradeaus[geradeaus.length - 1].zeit;
    const zeitKehre = kehre[kehre.length - 1].zeit;
    // Die Kehre ist kürzer, braucht aber durchs Bremsen relativ mehr Zeit
    // je Kilometer als die Gerade.
    const distGerade = geradeaus[geradeaus.length - 1].dist;
    const distKehre = kehre[kehre.length - 1].dist;
    expect(zeitKehre / distKehre).toBeGreaterThan(zeitGerade / distGerade);
  });

  it("deckelt lange Strecken auf eine Minute", () => {
    const tabelle = berechneFlugTabelle(gerade(100, 50));
    expect(tabelle[tabelle.length - 1].zeit).toBeLessThanOrEqual(60.001);
  });

  it("trägt monoton wachsende Zeiten und Distanzen", () => {
    const tabelle = berechneFlugTabelle(gerade(5, 8));
    for (let i = 1; i < tabelle.length; i++) {
      expect(tabelle[i].zeit).toBeGreaterThan(tabelle[i - 1].zeit);
      expect(tabelle[i].dist).toBeGreaterThan(tabelle[i - 1].dist);
    }
  });
});

describe("positionBei", () => {
  const tabelle = berechneFlugTabelle(gerade(9));

  it("startet am ersten Punkt", () => {
    const pos = positionBei(tabelle, 0)!;
    expect(pos.punkt[0]).toBeCloseTo(8);
    expect(pos.punkt[1]).toBeCloseTo(47);
  });

  it("meldet nach dem Ende null", () => {
    const ende = tabelle[tabelle.length - 1].zeit;
    expect(positionBei(tabelle, ende)).toBeNull();
    expect(positionBei(tabelle, ende + 10)).toBeNull();
  });

  it("liegt zur halben Zeit in der Streckenmitte", () => {
    const ende = tabelle[tabelle.length - 1].zeit;
    const pos = positionBei(tabelle, ende / 2)!;
    // Gerade, konstantes Tempo: halbe Zeit ≈ halbe Strecke.
    expect(pos.punkt[1]).toBeCloseTo(47 + 9 / 111.32 / 2, 3);
    expect(pos.kurs).toBeCloseTo(0, 0);
  });

  it("gibt bei leerer Tabelle null", () => {
    expect(positionBei([], 5)).toBeNull();
  });
});
