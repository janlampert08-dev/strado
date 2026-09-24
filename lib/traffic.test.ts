import { describe, expect, it } from "vitest";
import {
  anteilMindestens,
  hauptStufe,
  sampleRoutePoints,
  sliceRouteByTraffic,
  worstCongestion,
} from "@/lib/traffic";

describe("hauptStufe", () => {
  it("nimmt die stärkste Stufe, die den verlangten Anteil erreicht", () => {
    const zehn: ("low" | "heavy" | "severe")[] = [
      "severe", "heavy", "heavy", "heavy", "heavy", "heavy", "low", "low", "low", "low",
    ];
    expect(hauptStufe(zehn, 0.25)).toBe("heavy");
    expect(hauptStufe(["low", "severe", "low", "low", "low"], 0.25)).toBe("low");
    expect(hauptStufe([null, null], 0.25)).toBeNull();
  });
});

describe("anteilMindestens", () => {
  it("zählt nur Punkte mit Daten und alle Stufen ab der gefragten", () => {
    expect(anteilMindestens(["low", "severe", null, "heavy"], "heavy")).toBeCloseTo(2 / 3);
    expect(anteilMindestens(["low", "low"], "severe")).toBe(0);
    expect(anteilMindestens([null, null], "low")).toBe(0);
  });
});

describe("sampleRoutePoints", () => {
  it("returns an empty array for an empty route", () => {
    expect(sampleRoutePoints([], 5)).toEqual([]);
  });

  it("returns all points when there are fewer than requested", () => {
    const coords: [number, number][] = [
      [8.0, 47.0],
      [8.1, 47.1],
    ];
    expect(sampleRoutePoints(coords, 5)).toEqual(coords);
  });

  it("always includes the first and last point", () => {
    const coords: [number, number][] = Array.from({ length: 100 }, (_, i) => [
      8.0 + i * 0.001,
      47.0,
    ]);
    const sample = sampleRoutePoints(coords, 6);
    expect(sample[0]).toEqual(coords[0]);
    expect(sample[sample.length - 1]).toEqual(coords[coords.length - 1]);
  });

  it("evenly spreads the requested number of samples", () => {
    const coords: [number, number][] = Array.from({ length: 100 }, (_, i) => [
      8.0 + i * 0.001,
      47.0,
    ]);
    expect(sampleRoutePoints(coords, 6)).toHaveLength(6);
  });
});

describe("worstCongestion", () => {
  it("returns null for no data", () => {
    expect(worstCongestion([])).toBeNull();
  });

  it("returns the single level when only one is present", () => {
    expect(worstCongestion(["low"])).toBe("low");
  });

  it("picks the most severe level among mixed samples", () => {
    expect(worstCongestion(["low", "heavy", "moderate"])).toBe("heavy");
  });

  it("recognizes severe as worse than heavy", () => {
    expect(worstCongestion(["heavy", "severe", "low"])).toBe("severe");
  });
});

describe("sliceRouteByTraffic", () => {
  const coords: [number, number][] = Array.from({ length: 100 }, (_, i) => [
    8.0 + i * 0.001,
    47.0,
  ]);

  it("covers the whole route without gaps or overlaps", () => {
    const levels: ("low" | null)[] = ["low", "low", "low", "low", "low", "low"];
    const slices = sliceRouteByTraffic(coords, levels);
    expect(slices[0].coords[0]).toEqual(coords[0]);
    expect(slices[slices.length - 1].coords.at(-1)).toEqual(coords[coords.length - 1]);
    // Jeder Abschnitt endet dort, wo der nächste beginnt (gemeinsamer Grenzpunkt).
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].coords[0]).toEqual(slices[i - 1].coords.at(-1));
    }
  });

  it("assigns each slice the level of its sample point", () => {
    const levels: ("low" | "severe" | null)[] = [
      "low",
      "low",
      "severe",
      "severe",
      "low",
      "low",
    ];
    const slices = sliceRouteByTraffic(coords, levels);
    expect(slices.map((s) => s.level)).toEqual(levels);
  });

  it("returns an empty array for an empty route", () => {
    expect(sliceRouteByTraffic([], [])).toEqual([]);
  });
});
