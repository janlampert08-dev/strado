import { describe, it, expect } from "vitest";
import {
  MAX_EINGABE_KMH,
  MIN_EINGABE_KMH,
  istPlausiblesTempolimitSegment,
} from "./tempolimitEingabe";
import { averageTempolimit, estimateRouteDurationMinutes } from "./geo";

function segment(over: Record<string, unknown> = {}) {
  return { km_von: 0, km_bis: 10, kmh: 80, bekannt: true, ...over };
}

describe("istPlausiblesTempolimitSegment", () => {
  it("nimmt an, was der echte Erzeuger liefert", () => {
    // buildSpeedSegments (lib/mapboxDirections.ts) setzt fuer unbekannte
    // Abschnitte kmh 80 mit bekannt=false, sonst das gemeldete Limit.
    expect(istPlausiblesTempolimitSegment(segment())).toBe(true);
    expect(istPlausiblesTempolimitSegment(segment({ kmh: 80, bekannt: false }))).toBe(true);
    for (const kmh of [20, 30, 50, 60, 80, 100, 120]) {
      expect(istPlausiblesTempolimitSegment(segment({ kmh }))).toBe(true);
    }
  });

  it("nimmt 130 an — eine Strecke darf ueber die Grenze reichen", () => {
    // Genau deshalb NICHT MAX_KMH (120) aus lib/tempolimitAbgleich.ts: das
    // ist die Grenze fuer amtliche Schweizer Werte, nicht fuer die Eingabe.
    expect(istPlausiblesTempolimitSegment(segment({ kmh: 130 }))).toBe(true);
  });

  it("nimmt ein Segment ohne Laenge an", () => {
    // Zwei Stuetzpunkte unter 5 m Abstand runden auf zwei Nachkommastellen
    // zur selben Kilometermarke. Das Segment ist echt und wiegt null.
    expect(istPlausiblesTempolimitSegment(segment({ km_von: 3.5, km_bis: 3.5 }))).toBe(true);
  });

  it("lehnt die Werte ab, die eine negative Fahrzeit erzeugt haben", () => {
    expect(istPlausiblesTempolimitSegment(segment({ kmh: -100 }))).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ kmh: 9999 }))).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ kmh: 0 }))).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ kmh: 0.4 }))).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ kmh: MIN_EINGABE_KMH - 1 }))).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ kmh: MAX_EINGABE_KMH + 1 }))).toBe(false);
  });

  it("lehnt einen rueckwaerts laufenden Abschnitt ab", () => {
    // Der zieht im laengengewichteten Mittel in die Gegenrichtung und laesst
    // sich damit gegen die uebrigen Segmente ausspielen.
    expect(istPlausiblesTempolimitSegment(segment({ km_von: 10, km_bis: 0 }))).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ km_von: -5, km_bis: 5 }))).toBe(false);
  });

  it("lehnt weiterhin ab, was die alte Formpruefung ablehnte", () => {
    expect(istPlausiblesTempolimitSegment(null)).toBe(false);
    expect(istPlausiblesTempolimitSegment("80")).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ kmh: NaN }))).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ km_bis: Infinity }))).toBe(false);
    expect(istPlausiblesTempolimitSegment(segment({ bekannt: "ja" }))).toBe(false);
  });
});

describe("Wirkung auf die veroeffentlichten Zahlen", () => {
  // Was ohne die Pruefung auf der Streckenseite und in /api/strecken stand —
  // am echten Modul gemessen, nicht geschaetzt.
  it("haelt genau die Eingaben fern, die unsinnige Zahlen erzeugen", () => {
    const boese = [
      { fall: segment({ kmh: -100 }), erwarteteMinuten: -7 },
      { fall: segment({ km_bis: 12, kmh: 9999 }), erwarteteMinuten: 0 },
    ];
    for (const { fall, erwarteteMinuten } of boese) {
      const segmente = [fall as never];
      expect(estimateRouteDurationMinutes(10, ["passstrasse"], segmente)).toBe(erwarteteMinuten);
      expect(averageTempolimit(segmente)).toBe(fall.kmh);
      // ...und genau das kommt jetzt gar nicht mehr so weit.
      expect(istPlausiblesTempolimitSegment(fall)).toBe(false);
    }
  });
});
