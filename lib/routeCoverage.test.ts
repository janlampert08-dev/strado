import { describe, expect, it } from "vitest";
import { COVERAGE_THRESHOLD_PERCENT, computeRouteCoverage } from "@/lib/routeCoverage";

// Gerade Strecke ~2.3km lang (100 Punkte, ~23m Abstand), analog zum
// "straight"-Testfixture in lib/elevation.test.ts.
const route: [number, number][] = Array.from({ length: 101 }, (_, i) => [
  8.0 + i * 0.0003,
  47.0,
]);

describe("computeRouteCoverage", () => {
  it("returns 0 for an empty trail", () => {
    expect(computeRouteCoverage(route, [])).toBe(0);
  });

  it("returns 0 for a route with fewer than two points", () => {
    expect(computeRouteCoverage([[8.0, 47.0]], route)).toBe(0);
  });

  it("returns full coverage when the trail follows the entire route", () => {
    expect(computeRouteCoverage(route, route)).toBe(100);
  });

  it("reports partial coverage for a trail that stops halfway (unfinished/wrong endpoint)", () => {
    const halfTrail = route.slice(0, 51);
    const coverage = computeRouteCoverage(route, halfTrail);
    expect(coverage).toBeGreaterThan(40);
    expect(coverage).toBeLessThan(60);
  });

  it("reports low coverage for a trail that skips the middle (shortcut)", () => {
    const shortcutTrail = [...route.slice(0, 15), ...route.slice(-15)];
    const coverage = computeRouteCoverage(route, shortcutTrail);
    expect(coverage).toBeLessThan(50);
  });

  it("stays near 100 for a trail with minor GPS jitter around the route", () => {
    const jitteredTrail: [number, number][] = route.map(([lon, lat]) => [
      lon + 0.0002,
      lat + 0.0002,
    ]);
    const coverage = computeRouteCoverage(route, jitteredTrail);
    expect(coverage).toBeGreaterThan(70);
  });
});

// Der Fall aus dem Audit vom 2026-09-06 (A1, dritter Punkt): eine Strecke,
// die über dieselbe Strasse zurückführt, halb gefahren. Der reine
// Berührungsanteil sieht 100 %, weil jeder Abtastpunkt des Rückwegs auf dem
// Hinweg liegt. Genau dieses Ergebnis wurde damals durch Ausführen der
// Funktion nachgewiesen — hier steht es jetzt als Regressionstest in der
// Gegenrichtung.
describe("Hin-und-zurück-Strecken", () => {
  // Eine gerade Ost-West-Linie und dieselbe Linie zurück. Bei 47° Breite
  // sind 0.01° Länge rund 760 m, die Strecke ist also grob 15 km lang
  // (7.5 km hin, 7.5 km zurück).
  const hin: [number, number][] = Array.from(
    { length: 11 },
    (_, i) => [8.5 + i * 0.001, 47.0] as [number, number],
  );
  const zurueck = [...hin].reverse();
  const strecke = [...hin, ...zurueck.slice(1)];

  it("wertet die nur einfach gefahrene Strecke nicht mehr als vollständig", () => {
    const nurHin = computeRouteCoverage(strecke, hin);
    // Berührt ist alles, zurückgelegt ist die Hälfte.
    expect(nurHin).toBeLessThan(COVERAGE_THRESHOLD_PERCENT);
    expect(nurHin).toBeGreaterThan(40);
    expect(nurHin).toBeLessThan(60);
  });

  it("wertet die vollständig gefahrene Strecke weiterhin als vollständig", () => {
    expect(computeRouteCoverage(strecke, strecke)).toBe(100);
  });
});

describe("zurückgelegte Länge", () => {
  const gerade: [number, number][] = Array.from(
    { length: 21 },
    (_, i) => [8.5 + i * 0.001, 47.0] as [number, number],
  );

  it("straft eine Fahrt ab, die nur einen Teil der Strecke zurücklegt", () => {
    // Erste Hälfte der Strecke: der Berührungsanteil liegt bei rund 50 %,
    // die zurückgelegte Länge ebenfalls — beide zeigen dasselbe.
    const halb = gerade.slice(0, 11);
    expect(computeRouteCoverage(gerade, halb)).toBeLessThan(COVERAGE_THRESHOLD_PERCENT);
  });

  it("bestraft einen Umweg nicht", () => {
    // Die volle Strecke plus ein Stück daneben: mehr Länge als die Strecke,
    // das Minimum bleibt beim Berührungsanteil.
    const mitUmweg: [number, number][] = [
      ...gerade,
      [8.52, 47.01],
      [8.53, 47.02],
    ];
    expect(computeRouteCoverage(gerade, mitUmweg)).toBe(100);
  });

  it("bleibt bei einer entarteten Streckengeometrie beim Berührungsanteil", () => {
    // Zwei identische Punkte: Länge 0, kein sinnvolles Verhältnis bildbar.
    const punkt: [number, number][] = [
      [8.5, 47.0],
      [8.5, 47.0],
    ];
    expect(computeRouteCoverage(punkt, [[8.5, 47.0]])).toBe(100);
  });
});
