import { describe, expect, it } from "vitest";
import { amtlicherAnteilProzent, sliceRouteBySpeed, speedColor, tempolimitQuelle } from "@/lib/speed";
import type { TempolimitSegment } from "@/types/database";

describe("speedColor", () => {
  it("buckets speeds into the correct Swiss speed-limit category", () => {
    expect(speedColor(30)).toBe(speedColor(30));
    expect(speedColor(50)).not.toBe(speedColor(30));
    expect(speedColor(80)).not.toBe(speedColor(120));
  });

  it("falls back to the highest bucket above the top threshold", () => {
    expect(speedColor(200)).toBe(speedColor(120));
  });
});

describe("amtlicherAnteilProzent", () => {
  it("returns 0 for missing/empty segments", () => {
    expect(amtlicherAnteilProzent(null)).toBe(0);
    expect(amtlicherAnteilProzent([])).toBe(0);
  });

  it("computes the length-weighted official share", () => {
    const segments: TempolimitSegment[] = [
      { km_von: 0, km_bis: 8, kmh: 60, bekannt: true, amtlich: true },
      { km_von: 8, km_bis: 10, kmh: 80, bekannt: true, amtlich: false },
    ];
    expect(amtlicherAnteilProzent(segments)).toBe(80);
  });
});

describe("tempolimitQuelle", () => {
  it("says nothing without segments", () => {
    expect(tempolimitQuelle(null)).toBeNull();
    expect(tempolimitQuelle([])).toBeNull();
  });

  it("distinguishes map estimates, official data and a mix", () => {
    const karte: TempolimitSegment = { km_von: 0, km_bis: 5, kmh: 80, bekannt: true };
    const amtlich: TempolimitSegment = { km_von: 5, km_bis: 10, kmh: 50, bekannt: true, amtlich: true, quelle: "zh" };
    expect(tempolimitQuelle([karte])).toBe("Kartendaten (OSM/Mapbox), nicht amtlich");
    expect(tempolimitQuelle([{ ...amtlich, km_von: 0 }])).toBe("Amtliche Daten (Kanton/Stadt)");
    expect(tempolimitQuelle([karte, amtlich])).toBe("Amtliche Daten (Kanton/Stadt) für 50 %, sonst Kartendaten (OSM/Mapbox)");
  });
});

describe("sliceRouteBySpeed", () => {
  const coords: [number, number][] = [
    [8.5, 47.3],
    [8.51, 47.3],
    [8.52, 47.3],
    [8.53, 47.3],
  ];

  it("drops segments that resolve to fewer than two coordinates", () => {
    const segments: TempolimitSegment[] = [{ km_von: 999, km_bis: 999.1, kmh: 50, bekannt: true }];
    expect(sliceRouteBySpeed(coords, segments)).toHaveLength(0);
  });

  it("slices coordinates by cumulative distance into per-segment colors", () => {
    const segments: TempolimitSegment[] = [{ km_von: 0, km_bis: 1000, kmh: 50, bekannt: true }];
    const slices = sliceRouteBySpeed(coords, segments);
    expect(slices).toHaveLength(1);
    expect(slices[0].coords.length).toBe(coords.length);
    expect(slices[0].kmh).toBe(50);
  });
});
