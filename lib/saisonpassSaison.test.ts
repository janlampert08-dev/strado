import { describe, expect, it } from "vitest";
import { monatInZuerich, saisonpassImWinter } from "@/lib/saisonpassSaison";

describe("saisonpassImWinter", () => {
  it("rät im Oktober bis Februar zum Jahresabo", () => {
    for (const datum of [
      "2026-10-15T12:00:00Z",
      "2026-11-01T12:00:00Z",
      "2026-12-24T12:00:00Z",
      "2027-01-10T12:00:00Z",
      "2027-02-28T12:00:00Z",
    ]) {
      expect(saisonpassImWinter(new Date(datum))).toBe(true);
    }
  });

  it("lässt den Pass von März bis September ohne Hinweis", () => {
    for (const datum of [
      "2027-03-01T12:00:00Z",
      "2027-04-15T12:00:00Z",
      "2027-07-01T12:00:00Z",
      "2026-09-25T12:00:00Z",
    ]) {
      expect(saisonpassImWinter(new Date(datum))).toBe(false);
    }
  });

  it("rechnet in Zürcher Zeit, nicht in UTC", () => {
    // 30.09. 23:30 UTC ist in Zürich (MESZ, +2) schon der 1. Oktober.
    expect(monatInZuerich(new Date("2026-09-30T23:30:00Z"))).toBe(10);
    expect(saisonpassImWinter(new Date("2026-09-30T23:30:00Z"))).toBe(true);
    // 28.02. 23:30 UTC ist in Zürich (MEZ, +1) schon der 1. März.
    expect(saisonpassImWinter(new Date("2027-02-28T23:30:00Z"))).toBe(false);
    // Und umgekehrt: 30.09. 21:00 UTC ist in Zürich noch September.
    expect(saisonpassImWinter(new Date("2026-09-30T21:00:00Z"))).toBe(false);
  });
});
