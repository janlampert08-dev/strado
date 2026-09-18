import { describe, expect, it } from "vitest";
import { osmMaxspeed } from "./laden.mjs";

// maxspeed ist in OpenStreetMap ein Freitextfeld: von der blanken Zahl über
// die Schweizer Kürzel bis zu Angaben, die gar kein Limit nennen.
describe("osmMaxspeed", () => {
  it("liest Zahlen", () => {
    expect(osmMaxspeed("50")).toBe(50);
    expect(osmMaxspeed(" 80 ")).toBe(80);
    expect(osmMaxspeed(120)).toBe(120);
  });

  it("löst die Schweizer Kürzel auf", () => {
    expect(osmMaxspeed("CH:motorway")).toBe(120);
    expect(osmMaxspeed("ch:trunk")).toBe(100);
    expect(osmMaxspeed("CH:rural")).toBe(80);
    expect(osmMaxspeed("CH:urban")).toBe(50);
  });

  it("nimmt bei mehreren Werten den ersten", () => {
    expect(osmMaxspeed("50;80")).toBe(50);
    expect(osmMaxspeed("CH:urban;30")).toBe(50);
  });

  it("verwirft alles, was kein Limit in km/h ist", () => {
    for (const wert of ["none", "walk", "variable", "signals", "50 mph", "", null, undefined, "DE:urban"]) {
      expect(osmMaxspeed(wert)).toBeNull();
    }
  });
});
