import { describe, expect, it } from "vitest";
import {
  formatAbstand,
  liveAbstandSekunden,
  liveSplitEingeschaltet,
  markeUeberschritten,
} from "@/lib/liveSplit";

describe("liveSplitEingeschaltet", () => {
  it("is off unless the switch says exactly 'an'", () => {
    expect(liveSplitEingeschaltet(undefined)).toBe(false);
    expect(liveSplitEingeschaltet("")).toBe(false);
    expect(liveSplitEingeschaltet("true")).toBe(false);
    expect(liveSplitEingeschaltet(" An ")).toBe(true);
  });
});

describe("liveAbstandSekunden", () => {
  const basis = { laengeKm: 10, referenzS: 600 };

  it("compares elapsed time with the pro-rata reference", () => {
    // Halbe Strecke, Referenz dafür 300 s; 288 s gebraucht → 12 s schneller.
    expect(liveAbstandSekunden({ ...basis, verstrichenS: 288, gefahrenKm: 5 })).toBe(-12);
    expect(liveAbstandSekunden({ ...basis, verstrichenS: 365, gefahrenKm: 5 })).toBe(65);
  });

  it("is exact at the finish and does not extrapolate past it", () => {
    expect(liveAbstandSekunden({ ...basis, verstrichenS: 590, gefahrenKm: 10.4 })).toBe(-10);
  });

  it("says nothing before 300 m or without a reference", () => {
    expect(liveAbstandSekunden({ ...basis, verstrichenS: 10, gefahrenKm: 0.2 })).toBeNull();
    expect(liveAbstandSekunden({ ...basis, referenzS: null, verstrichenS: 100, gefahrenKm: 2 })).toBeNull();
    expect(liveAbstandSekunden({ ...basis, laengeKm: 0, verstrichenS: 100, gefahrenKm: 2 })).toBeNull();
  });
});

describe("formatAbstand", () => {
  it("uses a real minus and m:ss", () => {
    expect(formatAbstand(-12)).toBe("−0:12");
    expect(formatAbstand(65)).toBe("+1:05");
    expect(formatAbstand(0)).toBe("±0:00");
  });
});

describe("markeUeberschritten", () => {
  it("ticks once when crossing a quarter", () => {
    expect(markeUeberschritten(2.4, 2.6, 10)).toBe(true);
    expect(markeUeberschritten(2.6, 2.8, 10)).toBe(false);
    expect(markeUeberschritten(7.4, 7.5, 10)).toBe(true);
  });
});
