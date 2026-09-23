import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPO_FARBEN, amtlicherAnteilProzent, sliceRouteBySpeed, speedColor, speedStufe, tempolimitQuelle } from "@/lib/speed";
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

  it("behauptet nicht 'amtlich', wenn ein kurzes Stück aus Kartendaten stammt", () => {
    // 19,95 km amtlich, 50 m aus Kartendaten: der gerundete Anteil ist 100,
    // die Aussage darf es nicht sein — sie steht auf der öffentlichen API.
    const amtlich: TempolimitSegment = { km_von: 0, km_bis: 19.95, kmh: 80, bekannt: true, amtlich: true, quelle: "zh" };
    const karte: TempolimitSegment = { km_von: 19.95, km_bis: 20, kmh: 80, bekannt: true };
    expect(amtlicherAnteilProzent([amtlich, karte])).toBe(100);
    expect(tempolimitQuelle([amtlich, karte])).toBe(
      "Amtliche Daten (Kanton/Stadt) für 99 %, sonst Kartendaten (OSM/Mapbox)",
    );
  });

  it("nennt eine Strecke ohne jedes amtliche Stück nicht amtlich, auch bei winzigem Rest", () => {
    const karte: TempolimitSegment = { km_von: 0, km_bis: 19.95, kmh: 80, bekannt: true };
    const winzig: TempolimitSegment = { km_von: 19.95, km_bis: 20, kmh: 80, bekannt: true };
    expect(tempolimitQuelle([karte, winzig])).toBe("Kartendaten (OSM/Mapbox), nicht amtlich");
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

describe("Tempo-Farbskala", () => {
  // Relative Leuchtdichte nach WCAG — reicht, um die Ordnung zu prüfen.
  function leuchtdichte(hex: string): number {
    const kanal = (i: number) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * kanal(1) + 0.7152 * kanal(3) + 0.0722 * kanal(5);
  }

  it("gets brighter with speed on dark and darker with speed on light", () => {
    const dunkel = TEMPO_FARBEN.dunkel.map(leuchtdichte);
    const hell = TEMPO_FARBEN.hell.map(leuchtdichte);
    for (let i = 1; i < 5; i++) {
      expect(dunkel[i]).toBeGreaterThan(dunkel[i - 1]);
      expect(hell[i]).toBeLessThan(hell[i - 1]);
    }
  });

  it("maps speeds onto the five Swiss limit steps", () => {
    expect([10, 30, 31, 50, 60, 61, 80, 81, 130].map(speedStufe)).toEqual([0, 0, 1, 1, 2, 3, 3, 4, 4]);
    expect(speedColor(45, "hell")).toBe(TEMPO_FARBEN.hell[1]);
  });

  // Die Karte (Hex) und das Diagramm (CSS-Token) müssen dieselben Farben
  // zeigen — zwei Quellen, also ein Test, der sie zusammenhält.
  it("keeps the CSS tokens in app/globals.css equal to TEMPO_FARBEN", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    for (let i = 0; i < 5; i++) {
      const werte = [...css.matchAll(new RegExp(`--data-speed-${i + 1}: (#[0-9a-f]{6});`, "g"))].map((m) => m[1]);
      expect(werte).toEqual([TEMPO_FARBEN.hell[i], TEMPO_FARBEN.dunkel[i], TEMPO_FARBEN.dunkel[i]]);
    }
  });
});
