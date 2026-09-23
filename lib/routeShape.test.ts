import { describe, expect, it } from "vitest";
import { routeShapePath, routeShapePoints } from "./routeShape";

describe("routeShapePoints / routeShapePath", () => {
  const linie: [number, number][] = [
    [9.0, 46.5],
    [9.1, 46.5],
    [9.1, 46.6],
  ];

  it("bleibt innerhalb der Fläche samt Rand", () => {
    for (const [x, y] of routeShapePoints(linie, 320, 200, 12)) {
      expect(x).toBeGreaterThanOrEqual(12 - 1e-9);
      expect(x).toBeLessThanOrEqual(308 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(12 - 1e-9);
      expect(y).toBeLessThanOrEqual(188 + 1e-9);
    }
  });

  it("legt Norden nach oben", () => {
    const [, , ziel] = routeShapePoints(linie, 320, 200, 12);
    const [start] = routeShapePoints(linie, 320, 200, 12);
    expect(ziel[1]).toBeLessThan(start[1]);
  });

  it("baut den Pfad aus denselben Punkten wie bisher", () => {
    const punkte = routeShapePoints(linie);
    expect(routeShapePath(linie)).toBe(
      `M${punkte.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`,
    );
  });

  it("liefert für weniger als zwei Punkte nichts", () => {
    expect(routeShapePoints([[9, 46]])).toEqual([]);
    expect(routeShapePath([[9, 46]])).toBe("");
  });
});
