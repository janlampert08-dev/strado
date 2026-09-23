import { describe, expect, it } from "vitest";
import { hoehenAchse, MINDEST_SPANNE_M } from "@/lib/hoehenAchse";

describe("hoehenAchse", () => {
  it("gives a flat city loop at least 300 m of span, centred", () => {
    const a = hoehenAchse(460, 623);
    expect(a.oben - a.unten).toBe(MINDEST_SPANNE_M);
    expect((a.oben + a.unten) / 2).toBeCloseTo(541.5);
  });

  it("keeps the real span of a pass", () => {
    const a = hoehenAchse(1360, 2315);
    expect(a.unten).toBe(1360);
    expect(a.oben).toBe(2315);
    expect(a.linien).toEqual([1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300]);
  });

  it("switches to 500 m contours above 1000 m of span", () => {
    expect(hoehenAchse(600, 2400).linien).toEqual([1000, 1500, 2000]);
  });
});
