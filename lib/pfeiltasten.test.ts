import { describe, expect, it } from "vitest";
import { zielIndex } from "@/lib/pfeiltasten";

describe("zielIndex", () => {
  it("wandert mit links/rechts und springt am Rand herum", () => {
    expect(zielIndex("ArrowRight", 0, 3)).toBe(1);
    expect(zielIndex("ArrowRight", 2, 3)).toBe(0);
    expect(zielIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(zielIndex("ArrowLeft", 2, 3)).toBe(1);
  });

  it("Home und End führen an den Anfang und ans Ende", () => {
    expect(zielIndex("Home", 2, 3)).toBe(0);
    expect(zielIndex("End", 0, 3)).toBe(2);
  });

  it("oben/unten nur, wenn die Leiste sie verlangt", () => {
    expect(zielIndex("ArrowDown", 0, 3)).toBeNull();
    expect(zielIndex("ArrowUp", 0, 3)).toBeNull();
    expect(zielIndex("ArrowDown", 0, 3, { senkrecht: true })).toBe(1);
    expect(zielIndex("ArrowUp", 0, 3, { senkrecht: true })).toBe(2);
  });

  it("lässt fremde Tasten und leere Leisten in Ruhe", () => {
    expect(zielIndex("Enter", 0, 3)).toBeNull();
    expect(zielIndex("Tab", 0, 3)).toBeNull();
    expect(zielIndex("ArrowRight", 0, 0)).toBeNull();
  });

  it("klemmt einen Ausgangswert ausserhalb der Leiste ein", () => {
    expect(zielIndex("ArrowRight", -1, 3)).toBe(1);
    expect(zielIndex("ArrowLeft", 5, 3)).toBe(1);
  });
});
