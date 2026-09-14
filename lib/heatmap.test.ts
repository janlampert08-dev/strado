import { describe, expect, it } from "vitest";
import { buildHeatmapDays, buildHeatmapMonthLabels } from "@/lib/heatmap";

describe("buildHeatmapDays", () => {
  it("returns weeks * 7 days ending on the Sunday of the reference date's week", () => {
    // Mittwoch, 2026-03-11 (UTC)
    const days = buildHeatmapDays([], { weeks: 2, referenceDate: new Date("2026-03-11T12:00:00Z") });
    expect(days).toHaveLength(14);
    expect(days[0].dateKey).toBe("2026-03-02"); // Montag, zwei Wochen vor Wochenende
    expect(days[days.length - 1].dateKey).toBe("2026-03-15"); // Sonntag derselben Woche wie der Stichtag
  });

  it("counts one ride per matching day and zero elsewhere", () => {
    const days = buildHeatmapDays(["2026-03-10", "2026-03-10T00:00:00.000Z"], {
      weeks: 1,
      referenceDate: new Date("2026-03-11T12:00:00Z"),
    });
    const byKey = new Map(days.map((d) => [d.dateKey, d.count]));
    expect(byKey.get("2026-03-10")).toBe(2);
    expect(byKey.get("2026-03-09")).toBe(0);
  });

  it("ignores ride dates outside the requested window", () => {
    const days = buildHeatmapDays(["2020-01-01"], { weeks: 1, referenceDate: new Date("2026-03-11T12:00:00Z") });
    expect(days.every((d) => d.count === 0)).toBe(true);
  });
});

describe("buildHeatmapMonthLabels", () => {
  it("beschriftet die Spalte, in der ein neuer Monat beginnt", () => {
    // Gitter vom 2026-01-05 (Montag) bis 2026-03-15, 10 Wochen
    const days = buildHeatmapDays([], { weeks: 10, referenceDate: new Date("2026-03-11T12:00:00Z") });
    expect(days[0].dateKey).toBe("2026-01-05");
    const labels = buildHeatmapMonthLabels(days);
    expect(labels).toEqual([
      { label: "Jan", weekIndex: 0 }, // startet am 5. Januar, also am Monatsanfang
      { label: "Feb", weekIndex: 4 }, // Montag 2026-02-02
      { label: "Mär", weekIndex: 8 }, // Montag 2026-03-02
    ]);
  });

  it("lässt die erste Spalte unbeschriftet, wenn sie mitten im Monat beginnt", () => {
    // Gitter vom 2026-02-16, also weder Monatsanfang noch Monatswechsel
    const days = buildHeatmapDays([], { weeks: 4, referenceDate: new Date("2026-03-11T12:00:00Z") });
    expect(days[0].dateKey).toBe("2026-02-16");
    expect(buildHeatmapMonthLabels(days)).toEqual([{ label: "Mär", weekIndex: 2 }]);
  });

  it("überspringt Labels, die zu dicht beieinander oder am rechten Rand stünden", () => {
    const days = buildHeatmapDays([], { weeks: 10, referenceDate: new Date("2026-03-11T12:00:00Z") });
    // minWeekGap 5 lässt zwischen Jan (0) und Mär (8) kein Feb (4) zu,
    // die letzten zwei Spalten bleiben grundsätzlich frei.
    expect(buildHeatmapMonthLabels(days, { minWeekGap: 5 })).toEqual([
      { label: "Jan", weekIndex: 0 },
      { label: "Mär", weekIndex: 8 },
    ]);
  });
});
