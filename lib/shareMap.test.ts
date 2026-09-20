import { describe, expect, it } from "vitest";
import { bboxFuerRoute, kartenPunkte, staticKartenUrl } from "@/lib/shareMap";

// Klausenpass, grob: Altdorf → Linthal.
const KOORDS: [number, number][] = [
  [8.64, 46.88],
  [8.8, 46.9],
  [8.95, 46.95],
];

describe("bboxFuerRoute", () => {
  it("deckelt das Zielverhältnis in Mercator-Metern ab", () => {
    for (const verhaeltnis of [2, 1, 0.5]) {
      const bbox = bboxFuerRoute(KOORDS, verhaeltnis);
      const R = 6378137;
      const x = (lon: number) => ((lon * Math.PI) / 180) * R;
      const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2)) * R;
      const spanX = x(bbox.ost) - x(bbox.west);
      const spanY = y(bbox.nord) - y(bbox.sued);
      expect(spanX / spanY).toBeCloseTo(verhaeltnis, 6);
    }
  });

  it("hält die Linie innerhalb der Bbox", () => {
    const bbox = bboxFuerRoute(KOORDS, 16 / 9);
    for (const [lon, lat] of KOORDS) {
      expect(lon).toBeGreaterThanOrEqual(bbox.west);
      expect(lon).toBeLessThanOrEqual(bbox.ost);
      expect(lat).toBeGreaterThanOrEqual(bbox.sued);
      expect(lat).toBeLessThanOrEqual(bbox.nord);
    }
  });

  it("entartet bei einem Punkt nicht", () => {
    const bbox = bboxFuerRoute([[8.23, 46.8]], 1);
    expect(bbox.ost - bbox.west).toBeGreaterThan(0);
    expect(bbox.nord - bbox.sued).toBeGreaterThan(0);
  });
});

describe("kartenPunkte", () => {
  it("legt die Bbox-Ecken auf die Box-Ecken", () => {
    const box = { x: 10, y: 20, w: 800, h: 400 };
    const bbox = bboxFuerRoute(KOORDS, box.w / box.h, 0);
    // Ohne Polsterung berührt die Linie die längere Achse randgenau.
    const punkte = kartenPunkte(KOORDS, bbox, box);
    const xs = punkte.map(([x]) => x);
    const ys = punkte.map(([, y]) => y);
    const beruehrtX = Math.min(...xs) <= box.x + 1 && Math.max(...xs) >= box.x + box.w - 1;
    const beruehrtY = Math.min(...ys) <= box.y + 1 && Math.max(...ys) >= box.y + box.h - 1;
    expect(beruehrtX || beruehrtY).toBe(true);
    for (const [x, y] of punkte) {
      expect(x).toBeGreaterThanOrEqual(box.x - 1);
      expect(x).toBeLessThanOrEqual(box.x + box.w + 1);
      expect(y).toBeGreaterThanOrEqual(box.y - 1);
      expect(y).toBeLessThanOrEqual(box.y + box.h + 1);
    }
  });
});

describe("staticKartenUrl", () => {
  it("baut eine Bbox-URL ohne Mapbox-Ecke und begrenzt die Kanten", () => {
    const url = staticKartenUrl(
      { west: 8, sued: 46, ost: 9, nord: 47 },
      5000,
      400,
      "token-mit-sonderzeichen/+",
    );
    expect(url).toContain("/static/8.00000,46.00000,9.00000,47.00000/1280x400?");
    expect(url).toContain("logo=false&attribution=false");
    expect(url).toContain(`access_token=${encodeURIComponent("token-mit-sonderzeichen/+")}`);
  });
});
