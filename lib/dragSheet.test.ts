import { describe, expect, it } from "vitest";
import {
  clampSheetHeight,
  decideSheetGesture,
  isExpandedAfterDrag,
} from "@/lib/dragSheet";

const PEEK = 272;
const MAX = 700;

describe("clampSheetHeight", () => {
  it("keeps a height between peek and full height", () => {
    expect(clampSheetHeight(400, PEEK, MAX)).toBe(400);
  });

  it("never falls below the peek height", () => {
    expect(clampSheetHeight(10, PEEK, MAX)).toBe(PEEK);
  });

  it("never exceeds the full height", () => {
    expect(clampSheetHeight(9000, PEEK, MAX)).toBe(MAX);
  });

  it("falls back to the peek height when the container is smaller than the peek", () => {
    expect(clampSheetHeight(500, PEEK, 100)).toBe(PEEK);
  });
});

describe("isExpandedAfterDrag", () => {
  it("snaps open past the midpoint", () => {
    expect(isExpandedAfterDrag(500, PEEK, MAX)).toBe(true);
  });

  it("snaps closed below the midpoint", () => {
    expect(isExpandedAfterDrag(300, PEEK, MAX)).toBe(false);
  });

  it("stays closed on the midpoint itself", () => {
    expect(isExpandedAfterDrag((PEEK + MAX) / 2, PEEK, MAX)).toBe(false);
  });
});

describe("decideSheetGesture", () => {
  it("expands the collapsed sheet on a swipe up instead of scrolling the peek", () => {
    expect(decideSheetGesture({ deltaY: 40, deltaX: 0, expanded: false, scrollTop: 0 })).toBe(
      "sheet",
    );
  });

  it("expands even when the collapsed content could scroll", () => {
    expect(decideSheetGesture({ deltaY: 40, deltaX: 0, expanded: false, scrollTop: 120 })).toBe(
      "sheet",
    );
  });

  it("scrolls the content on a swipe up once the sheet is open", () => {
    expect(decideSheetGesture({ deltaY: 40, deltaX: 0, expanded: true, scrollTop: 0 })).toBe(
      "scroll",
    );
  });

  it("scrolls the content back before collapsing on a swipe down", () => {
    expect(decideSheetGesture({ deltaY: -40, deltaX: 0, expanded: true, scrollTop: 120 })).toBe(
      "scroll",
    );
  });

  it("collapses on a swipe down at the top of the content", () => {
    expect(decideSheetGesture({ deltaY: -40, deltaX: 0, expanded: true, scrollTop: 0 })).toBe(
      "sheet",
    );
  });

  it("leaves a swipe down alone while already collapsed", () => {
    expect(decideSheetGesture({ deltaY: -40, deltaX: 0, expanded: false, scrollTop: 0 })).toBe(
      "scroll",
    );
  });

  it("keeps its hands off a horizontal gesture", () => {
    expect(decideSheetGesture({ deltaY: 10, deltaX: 40, expanded: false, scrollTop: 0 })).toBe(
      "scroll",
    );
    expect(decideSheetGesture({ deltaY: -10, deltaX: -40, expanded: true, scrollTop: 0 })).toBe(
      "scroll",
    );
  });
});
