import { describe, it, expect } from "vitest";
import {
  GPS_BEREIT_MAX_M,
  gpsStufe,
  gpsBereitschaftsText,
  gpsBereitschaftsAnsage,
} from "@/lib/gpsBereitschaft";

describe("gpsStufe", () => {
  it("ohne Fix sucht es", () => {
    expect(gpsStufe(null)).toBe("sucht");
    expect(gpsStufe(undefined)).toBe("sucht");
  });

  // Die Grenze selbst gehört zu "bereit" (≤, nicht <) — so steht es in der
  // Vorgabe aus dem Mobile-Audit vom 2026-09-23.
  it("ist bis einschliesslich 25 m bereit", () => {
    expect(gpsStufe(6)).toBe("bereit");
    expect(gpsStufe(GPS_BEREIT_MAX_M)).toBe("bereit");
    expect(gpsStufe(25.4)).toBe("ungenau");
    expect(gpsStufe(80)).toBe("ungenau");
  });

  it("behandelt unmögliche Werte wie keinen Fix statt als bereit", () => {
    expect(gpsStufe(Number.NaN)).toBe("sucht");
    expect(gpsStufe(-3)).toBe("sucht");
    expect(gpsStufe(Number.POSITIVE_INFINITY)).toBe("sucht");
  });

  // Die Zeile darf nie "bereit" sagen, wo der Recorder den Fix noch
  // verwirft — sonst führe jemand los, dessen erste Punkte nicht zählen.
  // 50 ist MIN_ACCURACY_M aus components/useRideRecorder.ts, hier als Zahl:
  // der Import zöge die Server Actions des Recorders in einen Node-Test.
  it("ist strenger als die Aufnahmegrenze des Recorders", () => {
    expect(GPS_BEREIT_MAX_M).toBeLessThan(50);
  });
});

describe("gpsBereitschaftsText", () => {
  it("nennt die Genauigkeit je Stufe", () => {
    expect(gpsBereitschaftsText(6)).toBe("GPS ±6 m – bereit");
    expect(gpsBereitschaftsText(80)).toBe("GPS ±80 m – wird genauer…");
    expect(gpsBereitschaftsText(null)).toBe("GPS-Signal wird gesucht…");
  });

  it("rundet und zeigt nie ±0 m", () => {
    expect(gpsBereitschaftsText(4.6)).toBe("GPS ±5 m – bereit");
    expect(gpsBereitschaftsText(0.2)).toBe("GPS ±1 m – bereit");
  });
});

describe("gpsBereitschaftsAnsage", () => {
  // Die Live-Region soll nur bei einem Stufenwechsel sprechen: innerhalb
  // einer Stufe muss der Text also gleich bleiben, egal wie die Zahl springt.
  it("bleibt innerhalb einer Stufe gleich", () => {
    expect(gpsBereitschaftsAnsage(4)).toBe(gpsBereitschaftsAnsage(24));
    expect(gpsBereitschaftsAnsage(30)).toBe(gpsBereitschaftsAnsage(900));
  });

  it("unterscheidet die drei Stufen", () => {
    const texte = new Set([
      gpsBereitschaftsAnsage(null),
      gpsBereitschaftsAnsage(80),
      gpsBereitschaftsAnsage(6),
    ]);
    expect(texte.size).toBe(3);
  });
});
