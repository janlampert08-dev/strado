import { describe, expect, it } from "vitest";
import { massstab, profilPunkte, projectRoute, statsColumns } from "@/lib/shareLayout";

function bounds(points: [number, number][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

describe("projectRoute", () => {
  const box = { x: 40, y: 400, w: 1000, h: 500 };

  // Ein Ost-West-Rechteck um Zürich: 0.4° Länge sind bei cos(47°) ≈ 0.68
  // etwa 0.27° "echte" Breite, bei 0.1° Höhe also ein Seitenverhältnis von
  // rund 2.7 : 1 — breiter als die Box (2 : 1), die Breite ist also die
  // begrenzende Achse.
  const wide: [number, number][] = [
    [8.4, 47.3],
    [8.8, 47.3],
    [8.8, 47.4],
    [8.4, 47.4],
  ];

  it("fills the box along the limiting axis and stays inside it", () => {
    const b = bounds(projectRoute(wide, box));
    expect(b.minX).toBeCloseTo(box.x, 6);
    expect(b.maxX).toBeCloseTo(box.x + box.w, 6);
    expect(b.minY).toBeGreaterThanOrEqual(box.y);
    expect(b.maxY).toBeLessThanOrEqual(box.y + box.h);
  });

  it("keeps the latitude-corrected aspect ratio", () => {
    const b = bounds(projectRoute(wide, box));
    const cosLat = Math.cos((47.35 * Math.PI) / 180);
    const expected = (0.4 * cosLat) / 0.1;
    expect((b.maxX - b.minX) / (b.maxY - b.minY)).toBeCloseTo(expected, 6);
  });

  it("centres the line in the box", () => {
    const b = bounds(projectRoute(wide, box));
    expect((b.minY + b.maxY) / 2).toBeCloseTo(box.y + box.h / 2, 6);
  });

  // Nord-Süd-Linie: die Höhe begrenzt, und Norden muss oben (kleineres y)
  // liegen — Canvas-y wächst nach unten, geografische Breite nach oben.
  it("maps north to the top of the canvas", () => {
    const [sued, nord] = projectRoute(
      [
        [8.5, 46.0],
        [8.5, 47.0],
      ],
      box,
    );
    expect(nord[1]).toBeCloseTo(box.y, 6);
    expect(sued[1]).toBeCloseTo(box.y + box.h, 6);
  });

  it("does not divide by zero for a single point", () => {
    const [p] = projectRoute([[8.5, 47.0]], box);
    expect(Number.isFinite(p[0])).toBe(true);
    expect(Number.isFinite(p[1])).toBe(true);
  });
});

describe("statsColumns", () => {
  it("tiles the content width with equal, contiguous columns", () => {
    const cols = statsColumns(1080, 72, 4);
    expect(cols).toHaveLength(4);
    expect(cols[0].x).toBe(72);
    expect(cols[3].x + cols[3].w).toBeCloseTo(1080 - 72, 9);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i].x).toBeCloseTo(cols[i - 1].x + cols[i - 1].w, 9);
      expect(cols[i].w).toBeCloseTo(cols[0].w, 9);
    }
  });
});

describe("massstab", () => {
  const box = { x: 0, y: 0, w: 800, h: 600 };

  it("wählt eine runde Länge, die nicht über das Ziel hinausgeht", () => {
    // Ungefähr 20 km Ost-West auf 47° Breite.
    const coords: [number, number][] = [
      [8.3, 47],
      [8.563, 47],
    ];
    const m = massstab(coords, box, 180)!;
    expect([0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200]).toContain(m.km);
    expect(m.px).toBeLessThanOrEqual(180);
    // Die nächstgrössere Stufe wäre zu lang gewesen.
    expect(m.px * 2).toBeGreaterThan(180 * 0.4);
  });

  it("liefert nichts für weniger als zwei Punkte", () => {
    expect(massstab([[8, 47]], box)).toBeNull();
  });
});

describe("profilPunkte", () => {
  const box = { x: 10, y: 20, w: 100, h: 50 };

  it("legt den tiefsten Punkt über die Mindesthöhe und den höchsten an die Oberkante", () => {
    const pts = profilPunkte(
      [
        { km: 0, m: 400 },
        { km: 5, m: 900 },
        { km: 10, m: 600 },
      ],
      box,
    );
    expect(pts[0][0]).toBe(10);
    expect(pts[2][0]).toBe(110);
    expect(pts[1][1]).toBeCloseTo(20);
    expect(pts[0][1]).toBeCloseTo(20 + 50 - 50 * 0.12);
  });

  it("gibt für ein zu kurzes Profil eine leere Liste zurück", () => {
    expect(profilPunkte([{ km: 0, m: 400 }], box)).toEqual([]);
  });
});
