import { describe, expect, it } from "vitest";
import {
  buildHoehenprofil,
  computeAscentM,
  computeHoeheUndSteigung,
  MAX_STUETZPUNKTE,
  MIN_STUETZPUNKTE,
  SAMPLE_ABSTAND_M,
  stuetzpunkteFuer,
  countKehren,
  interpolateElevation,
} from "@/lib/elevation";

describe("computeHoeheUndSteigung", () => {
  it("finds the peak elevation and a plausible grade for a constant 10% ramp", () => {
    const profile = Array.from({ length: 11 }, (_, i) => ({
      dist: i * 100,
      elevation: 1000 + i * 100 * 0.1,
    }));
    const { hoeheM, maxSteigungProzent } = computeHoeheUndSteigung(profile);
    expect(hoeheM).toBe(1100);
    expect(maxSteigungProzent).toBeCloseTo(10, 0);
  });

  it("returns 0 grade for a flat profile", () => {
    const profile = Array.from({ length: 11 }, (_, i) => ({ dist: i * 100, elevation: 500 }));
    const { maxSteigungProzent } = computeHoeheUndSteigung(profile);
    expect(maxSteigungProzent).toBe(0);
  });
});

describe("buildHoehenprofil", () => {
  it("always includes the final point of the profile", () => {
    const profile = Array.from({ length: 50 }, (_, i) => ({ dist: i * 100, elevation: 1000 + i }));
    const points = buildHoehenprofil(profile, 10);
    const last = points[points.length - 1];
    expect(last.km).toBeCloseTo(profile[profile.length - 1].dist / 1000, 2);
  });

  it("downsamples to roughly the requested point count", () => {
    const profile = Array.from({ length: 300 }, (_, i) => ({ dist: i * 10, elevation: 1000 }));
    const points = buildHoehenprofil(profile, 80);
    expect(points.length).toBeLessThan(150);
    expect(points.length).toBeGreaterThan(10);
  });
});

describe("countKehren", () => {
  it("finds no hairpins on a straight line", () => {
    const straight: [number, number][] = Array.from({ length: 20 }, (_, i) => [
      8.0 + i * 0.0003,
      47.0,
    ]);
    expect(countKehren(straight)).toBe(0);
  });

  it("detects a single hairpin on a smooth 180° switchback", () => {
    // Local flat-earth projection (metres -> degrees) near 47°N, good enough
    // for a small synthetic geometry a few hundred metres across.
    const lat0 = 47.0;
    const lon0 = 8.0;
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const toLonLat = (x: number, y: number): [number, number] => [
      lon0 + x / mPerDegLon,
      lat0 + y / mPerDegLat,
    ];

    const radius = 25;
    const points: [number, number][] = [];
    // Straight approach heading east into the bend.
    for (let x = -100; x <= 0; x += 20) points.push(toLonLat(x, 0));
    // Smooth semicircular switchback (continuous curvature, not a sharp V).
    for (let deg = 15; deg < 180; deg += 15) {
      const theta = (deg * Math.PI) / 180;
      points.push(toLonLat(radius * Math.sin(theta), radius - radius * Math.cos(theta)));
    }
    // Straight exit heading west away from the bend.
    for (let x = -20; x >= -100; x -= 20) points.push(toLonLat(x, 2 * radius));

    expect(countKehren(points)).toBe(1);
  });

  it("returns 0 for a path too short to resample into a full window", () => {
    expect(countKehren([[8.0, 47.0], [8.001, 47.0]])).toBe(0);
  });
});

describe("interpolateElevation", () => {
  const profil = [
    { km: 0, m: 500 },
    { km: 5, m: 1000 },
    { km: 10, m: 800 },
  ];

  it("returns null for an empty profile", () => {
    expect(interpolateElevation([], 3)).toBeNull();
  });

  it("clamps to the first point before the route starts", () => {
    expect(interpolateElevation(profil, -1)).toBe(500);
  });

  it("clamps to the last point past the route end", () => {
    expect(interpolateElevation(profil, 99)).toBe(800);
  });

  it("linearly interpolates between two bracketing points", () => {
    // Halfway between km 0 (500m) and km 5 (1000m) -> 750m.
    expect(interpolateElevation(profil, 2.5)).toBe(750);
  });

  it("returns the exact value at a known point", () => {
    expect(interpolateElevation(profil, 5)).toBe(1000);
  });
});

describe("computeAscentM", () => {
  it("sums the climb of a single ascent", () => {
    const profile = Array.from({ length: 11 }, (_, i) => ({ dist: i * 100, elevation: 400 + i * 20 }));
    expect(computeAscentM(profile)).toBe(200);
  });

  it("counts both climbs of a ride over two hills, not the descents", () => {
    const up = (from: number, to: number) =>
      Array.from({ length: (to - from) / 20 }, (_, i) => from + i * 20);
    const down = (from: number, to: number) =>
      Array.from({ length: (from - to) / 20 }, (_, i) => from - i * 20);
    const elevations = [...up(400, 600), ...down(600, 400), ...up(400, 700), 700];
    const profile = elevations.map((elevation, i) => ({ dist: i * 100, elevation }));
    // Rechnerisch 500 m (200 + 300); die Median-Glättung kappt den scharfen
    // Gipfel und die scharfe Talsohle um je einen Schritt, daher die Spanne.
    // Entscheidend ist, dass der Abstieg nicht mitzählt (sonst ~700).
    expect(computeAscentM(profile)).toBeGreaterThan(440);
    expect(computeAscentM(profile)).toBeLessThan(510);
  });

  it("ignores noise below the minimum step on flat ground", () => {
    // Rauschen von ±2 m um dieselbe Höhe — ohne Schwelle ergäbe das über
    // hundert frei erfundene Höhenmeter.
    const profile = Array.from({ length: 100 }, (_, i) => ({
      dist: i * 100,
      elevation: 400 + (i % 2 === 0 ? 0 : 2),
    }));
    expect(computeAscentM(profile)).toBe(0);
  });

  it("returns 0 for a profile that is too short to say anything", () => {
    expect(computeAscentM([])).toBe(0);
    expect(computeAscentM([{ dist: 0, elevation: 400 }])).toBe(0);
  });
});


// Audit §B: nb_points war fest 300, unabhängig von der Länge. Auf langen
// Fahrten verschwanden dadurch kurze Anstiege im Raster, der summierte
// Anstieg fiel zu klein aus, und die Höhenmeter-Bestenliste belohnte das
// Zerschneiden einer Fahrt in mehrere kurze.
describe("stuetzpunkteFuer", () => {
  // Ein Grad Längengrad auf ~47° Nord sind grob 76 km — für die Tests wird
  // stattdessen mit kleinen Schritten eine bekannte Länge zusammengesetzt.
  function linieUeberMeter(meter: number): [number, number][] {
    // 0.001° Breite ≈ 111.2 m; daraus die nötige Punktzahl ableiten.
    const schritt = 0.001;
    const proSchrittM = 111.2;
    const punkte = Math.max(2, Math.round(meter / proSchrittM) + 1);
    return Array.from({ length: punkte }, (_, i) => [8.5, 47 + i * schritt] as [number, number]);
  }

  it("hält kurze Strecken bei der bisherigen Auflösung", () => {
    expect(stuetzpunkteFuer(linieUeberMeter(2_000))).toBe(MIN_STUETZPUNKTE);
  });

  it("skaliert mit der Länge, sobald die Untergrenze überschritten ist", () => {
    // 120 km bei einem Punkt alle 50 m wären 2400 — deutlich mehr als 300.
    const punkte = stuetzpunkteFuer(linieUeberMeter(120_000));
    expect(punkte).toBeGreaterThan(MIN_STUETZPUNKTE);
    expect(punkte).toBeLessThanOrEqual(MAX_STUETZPUNKTE);
    // Grob ein Punkt je SAMPLE_ABSTAND_M, mit Toleranz für die
    // Haversine-Näherung der Testgeometrie.
    expect(punkte).toBeGreaterThan((120_000 / SAMPLE_ABSTAND_M) * 0.9);
  });

  it("deckelt sehr lange Fahrten auf die Obergrenze", () => {
    expect(stuetzpunkteFuer(linieUeberMeter(400_000))).toBe(MAX_STUETZPUNKTE);
  });

  it("kommt mit einer entarteten Geometrie zurecht", () => {
    expect(stuetzpunkteFuer([])).toBe(MIN_STUETZPUNKTE);
    expect(stuetzpunkteFuer([[8.5, 47]])).toBe(MIN_STUETZPUNKTE);
  });
});
