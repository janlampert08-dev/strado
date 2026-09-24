import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline } from "@/lib/polyline";

describe("encodePolyline / decodePolyline", () => {
  it("kodiert das Referenzbeispiel aus Googles Dokumentation", () => {
    // Punkte dort als (lat, lng): (38.5, -120.2), (40.7, -120.95), (43.252, -126.453).
    // Hier als GeoJSON-Paare [lng, lat].
    const punkte: [number, number][] = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    expect(encodePolyline(punkte)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual(punkte);
  });

  it("hält [lng, lat] über den Hin- und Rückweg, auf 1e-5 genau", () => {
    const punkte: [number, number][] = [
      [9.746065, 46.629993],
      [9.746073, 46.630029],
      [9.746078, 46.63012],
      [9.9, 46.5],
    ];
    const zurueck = decodePolyline(encodePolyline(punkte));
    expect(zurueck).toHaveLength(punkte.length);
    zurueck.forEach(([lng, lat], i) => {
      expect(Math.abs(lng - punkte[i][0])).toBeLessThanOrEqual(0.000005 + 1e-12);
      expect(Math.abs(lat - punkte[i][1])).toBeLessThanOrEqual(0.000005 + 1e-12);
    });
  });

  it("verträgt negative Deltas, Nullstrecken und die Weltränder", () => {
    const punkte: [number, number][] = [
      [180, 90],
      [-180, -90],
      [-180, -90],
      [0, 0],
      [-0.00001, 0.00001],
    ];
    expect(decodePolyline(encodePolyline(punkte))).toEqual(punkte);
  });

  it("gibt für eine leere Linie eine leere Zeichenkette und zurück", () => {
    expect(encodePolyline([])).toBe("");
    expect(decodePolyline("")).toEqual([]);
  });

  it("ist bei gleicher Linie stabil (die Version hängt daran)", () => {
    const punkte: [number, number][] = [
      [8.5, 47.3],
      [8.51, 47.31],
    ];
    expect(encodePolyline(punkte)).toBe(encodePolyline(punkte.map(([a, b]) => [a, b])));
  });

  it("wirft bei einer abgeschnittenen Zeichenkette statt eine halbe Linie zu liefern", () => {
    const kodiert = encodePolyline([
      [8.5, 47.3],
      [8.6, 47.4],
    ]);
    expect(() => decodePolyline(kodiert.slice(0, -1))).toThrow();
  });

  it("wirft bei Zeichen ausserhalb des Alphabets", () => {
    expect(() => decodePolyline("  ")).toThrow();
    expect(() => decodePolyline("{ÿ")).toThrow();
  });

  it("wirft bei einer endlosen Fortsetzungskette", () => {
    expect(() => decodePolyline("~~~~~~~~~~~~")).toThrow();
  });
});
