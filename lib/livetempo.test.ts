import { describe, it, expect } from "vitest";
import { liveTempoKmh, MIN_TEMPO_INTERVALL_MS } from "@/lib/livetempo";
import { FLUG_TEMPO_KMH } from "@/lib/bewegungsprofil";

describe("liveTempoKmh", () => {
  // Der Befund, der diese Datei ausgelöst hat, als Test: die Anzeige stand
  // auf 1392 km/h, weil ein Fünf-Meter-Sprung 13 ms nach dem vorigen Punkt
  // ankam. 0,005 km / (0,013 s) sind gerechnet 1385 km/h — in der Anzeige
  // gerundet die Zahl, die gemeldet wurde.
  //
  // Der Test hält fest, dass daraus jetzt KEINE Zahl mehr wird. Nicht eine
  // gedeckelte, sondern gar keine: 13 ms sind kein Messintervall, aus dem
  // sich ein Tempo ableiten lässt, und eine gedeckelte 300 wäre eine
  // erfundene Auskunft statt einer fehlenden.
  it("leitet aus 5 Metern in 13 Millisekunden kein Tempo ab", () => {
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: 0.005, dtMs: 13 })).toBeNull();
  });

  // Dieselbe Rechnung, gegengeprüft: ohne die Intervallschwelle wären es
  // genau die gemeldeten rund 1392 km/h gewesen. Der Test steht hier,
  // damit niemand die Schwelle für Zierrat hält.
  it("hätte ohne Schwelle den gemeldeten Wert ergeben", () => {
    const ohneSchwelle = 0.005 / (13 / 3_600_000);
    expect(Math.round(ohneSchwelle)).toBe(1385);
    expect(ohneSchwelle).toBeGreaterThan(FLUG_TEMPO_KMH);
  });

  it("rechnet ein normales Intervall korrekt", () => {
    // 25 m in einer Sekunde sind 90 km/h.
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: 0.025, dtMs: 1000 })).toBeCloseTo(90, 6);
  });

  it("nimmt den Wert des Geräts, wenn es einen liefert", () => {
    // Auch wenn die abgeleitete Rechnung etwas ganz anderes ergäbe: der
    // Chip misst über den Doppler-Effekt und ist genauer als zwei
    // Positionen mit je 5 m Unsicherheit.
    expect(liveTempoKmh({ gpsTempoKmh: 72, segmentKm: 0.025, dtMs: 1000 })).toBe(72);
  });

  it("fällt auf die Rechnung zurück, wenn das Gerät Unsinn liefert", () => {
    // Ein Gerätewert über der Flugschwelle ist kein Grund, gar nichts zu
    // zeigen — die abgeleitete Rechnung kann trotzdem stimmen.
    expect(liveTempoKmh({ gpsTempoKmh: 5000, segmentKm: 0.025, dtMs: 1000 })).toBeCloseTo(90, 6);
  });

  it("verwirft auch eine abgeleitete Zahl über der Flugschwelle", () => {
    // 200 m in einer Sekunde sind 720 km/h — das Intervall ist lang genug,
    // die Zahl trotzdem unmöglich. Beides muss greifen, nicht nur eines.
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: 0.2, dtMs: 1000 })).toBeNull();
  });

  it("hält die Flugschwelle als Grenze ein, nicht als Näherung", () => {
    // Genau auf der Schwelle wird noch angezeigt, knapp darüber nicht mehr.
    const dtMs = 3_600_000;
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: FLUG_TEMPO_KMH, dtMs })).toBe(FLUG_TEMPO_KMH);
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: FLUG_TEMPO_KMH + 1, dtMs })).toBeNull();
  });

  it("verwirft ein Intervall knapp unter der Schwelle und nimmt es knapp darüber", () => {
    const segmentKm = 0.02;
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm, dtMs: MIN_TEMPO_INTERVALL_MS - 1 })).toBeNull();
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm, dtMs: MIN_TEMPO_INTERVALL_MS })).not.toBeNull();
  });

  // Manche Geräte korrigieren ihre Uhr mitten in der Fahrt. Dann liegt der
  // zweite Messzeitpunkt VOR dem ersten, und die alte Rechnung hätte ein
  // negatives Tempo angezeigt (dtHours > 0 fing nur die Null ab).
  it("verwirft einen Rückwärtssprung der Geräteuhr", () => {
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: 0.025, dtMs: -4000 })).toBeNull();
  });

  it("verwirft Stillstand nicht, sondern zeigt null km/h", () => {
    // Zwei Punkte am selben Ort, eine Sekunde auseinander: 0 km/h ist eine
    // Aussage und keine fehlende.
    expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: 0, dtMs: 1000 })).toBe(0);
    expect(liveTempoKmh({ gpsTempoKmh: 0, segmentKm: 0.025, dtMs: 1000 })).toBe(0);
  });

  it("verwirft unbrauchbare Zahlen statt sie weiterzureichen", () => {
    for (const kaputt of [NaN, Infinity, -Infinity]) {
      expect(liveTempoKmh({ gpsTempoKmh: kaputt, segmentKm: 0.025, dtMs: 1000 })).toBeCloseTo(90, 6);
      expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: kaputt, dtMs: 1000 })).toBeNull();
      expect(liveTempoKmh({ gpsTempoKmh: null, segmentKm: 0.025, dtMs: kaputt })).toBeNull();
    }
    expect(liveTempoKmh({ gpsTempoKmh: -10, segmentKm: 0.025, dtMs: 1000 })).toBeCloseTo(90, 6);
  });
});
