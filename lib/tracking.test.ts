import { describe, expect, it } from "vitest";
import {
  distanzZumNaechstenPunktKm,
  evaluateProximity,
  type ProximityState,
} from "@/lib/tracking";

// ~1.1km östlich von START (grob, für "weit weg"-Fälle)
const FAR: [number, number] = [8.55, 47.37];
const START: [number, number] = [8.54, 47.37];
// Rundstrecke: Ziel = Start.
const LOOP_END: [number, number] = START;
// Punkt-zu-Punkt-Strecke: eigenständiger Zielpunkt, weit von START entfernt.
const P2P_END: [number, number] = [8.60, 47.40];

function state(overrides: Partial<ProximityState>): ProximityState {
  return { hasStarted: false, hasLeftStart: false, ...overrides };
}

describe("evaluateProximity", () => {
  it("does not auto-start while far from the start point", () => {
    const result = evaluateProximity(FAR, START, LOOP_END, state({ hasStarted: false }));
    expect(result.shouldBeginTracking).toBe(false);
  });

  it("auto-starts once within start proximity", () => {
    const result = evaluateProximity(START, START, LOOP_END, state({ hasStarted: false }));
    expect(result.shouldBeginTracking).toBe(true);
  });

  // Regression für den in Commit b81d1d6 gefixten Bug: bei Rundstrecken
  // (Start = Ziel) durfte die Aufzeichnung nicht sofort nach dem Start
  // wieder automatisch stoppen.
  it("does not auto-stop right after starting a loop route (start === end)", () => {
    const result = evaluateProximity(
      START,
      START,
      LOOP_END,
      state({ hasStarted: true, hasLeftStart: false }),
    );
    expect(result.shouldAutoStop).toBe(false);
  });

  it("marks the start proximity as left once the driver moves away, without stopping yet", () => {
    const result = evaluateProximity(
      FAR,
      START,
      LOOP_END,
      state({ hasStarted: true, hasLeftStart: false }),
    );
    expect(result.hasLeftStart).toBe(true);
    expect(result.shouldAutoStop).toBe(false);
  });

  it("auto-stops a loop route once the driver returns to the start/end point after leaving it", () => {
    const result = evaluateProximity(
      LOOP_END,
      START,
      LOOP_END,
      state({ hasStarted: true, hasLeftStart: true }),
    );
    expect(result.shouldAutoStop).toBe(true);
  });

  it("does not auto-stop a point-to-point route just because the driver left the start", () => {
    const result = evaluateProximity(
      FAR,
      START,
      P2P_END,
      state({ hasStarted: true, hasLeftStart: true }),
    );
    expect(result.shouldAutoStop).toBe(false);
  });

  it("auto-stops a point-to-point route once the actual end point is reached", () => {
    const result = evaluateProximity(
      P2P_END,
      START,
      P2P_END,
      state({ hasStarted: true, hasLeftStart: true }),
    );
    expect(result.shouldAutoStop).toBe(true);
  });

  // Regression: die "hasLeftStart"-Prüfung muss den Start-Radius verwenden,
  // nicht den Ziel-Radius — bislang durch identische Default-Werte (beide
  // 0.15km) maskiert. NEAR_START liegt ~0.2km von START entfernt: innerhalb
  // eines grosszügigen Start-Radius (0.5km), aber ausserhalb eines engen
  // Ziel-Radius (0.1km). Mit dem alten, fehlerhaften Code (Vergleich gegen
  // endProximityKm) wäre hasLeftStart hier fälschlich bereits true.
  it("uses the start radius, not the end radius, to decide whether the start has been left", () => {
    const NEAR_START: [number, number] = [8.5425, 47.37];
    const result = evaluateProximity(
      NEAR_START,
      START,
      LOOP_END,
      state({ hasStarted: true, hasLeftStart: false }),
      0.5,
      0.1,
    );
    expect(result.hasLeftStart).toBe(false);
  });
});

describe("distanzZumNaechstenPunktKm", () => {
  it("returns null without any route points", () => {
    expect(distanzZumNaechstenPunktKm(FAR, [])).toBeNull();
  });

  it("returns zero exactly on a route point", () => {
    expect(distanzZumNaechstenPunktKm(START, [FAR, START, P2P_END])).toBe(0);
  });

  it("picks the nearest of several points", () => {
    // FAR liegt ~0,75 km östlich von START — der nächste Punkt muss also
    // deutlich unter einem Kilometer liegen und zu START gehören.
    const distanz = distanzZumNaechstenPunktKm(FAR, [P2P_END, START]);
    expect(distanz).not.toBeNull();
    expect(distanz!).toBeCloseTo(0.753, 2);
  });

  it("measures a small offset in meters, not kilometers", () => {
    // 0,001° östlich ≈ 75 m auf dieser Breite.
    const distanz = distanzZumNaechstenPunktKm([8.541, 47.37], [START]);
    expect(distanz).not.toBeNull();
    expect(distanz!).toBeGreaterThan(0.05);
    expect(distanz!).toBeLessThan(0.1);
  });
});
