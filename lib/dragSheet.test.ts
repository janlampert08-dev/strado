import { describe, expect, it } from "vitest";
import {
  clampSheetHeight,
  decideSheetGesture,
  gummibandHoehe,
  projizierterWeg,
  snapAfterFling,
  wischGeschwindigkeit,
  nextSnapOnTap,
  sheetHeightFor,
  sheetSnapHeights,
  snapAfterDrag,
  snapStep,
  type SheetHeights,
} from "@/lib/dragSheet";

const HEIGHTS: SheetHeights = { minPx: 40, peekPx: 272, maxPx: 700 };

describe("sheetSnapHeights", () => {
  it("maps the three snaps onto their pixel heights", () => {
    expect(sheetSnapHeights(HEIGHTS)).toEqual({ versteckt: 40, peek: 272, voll: 700 });
  });

  it("never lets the peek exceed the container height", () => {
    expect(sheetSnapHeights({ minPx: 40, peekPx: 272, maxPx: 100 })).toEqual({
      versteckt: 40,
      peek: 272,
      voll: 272,
    });
  });

  it("never lets the handle exceed the peek", () => {
    expect(sheetSnapHeights({ minPx: 400, peekPx: 272, maxPx: 700 }).peek).toBe(400);
  });
});

describe("clampSheetHeight", () => {
  it("keeps a height between the handle and the full height", () => {
    expect(clampSheetHeight(400, HEIGHTS)).toBe(400);
  });

  it("never falls below the handle height", () => {
    expect(clampSheetHeight(10, HEIGHTS)).toBe(40);
  });

  it("never exceeds the full height", () => {
    expect(clampSheetHeight(9000, HEIGHTS)).toBe(700);
  });

  it("allows dragging below the peek, which the two-state sheet did not", () => {
    expect(clampSheetHeight(120, HEIGHTS)).toBe(120);
  });
});

describe("snapAfterDrag", () => {
  it("snaps to the full height near the top", () => {
    expect(snapAfterDrag(600, HEIGHTS)).toBe("voll");
  });

  it("snaps to the peek in the middle", () => {
    expect(snapAfterDrag(300, HEIGHTS)).toBe("peek");
  });

  it("snaps out of the way near the bottom", () => {
    expect(snapAfterDrag(80, HEIGHTS)).toBe("versteckt");
  });

  it("keeps the lower snap on an exact tie", () => {
    expect(snapAfterDrag((40 + 272) / 2, HEIGHTS)).toBe("versteckt");
    expect(snapAfterDrag((272 + 700) / 2, HEIGHTS)).toBe("peek");
  });

  it("collapses peek and full into one snap when the container is shorter than the peek", () => {
    const flach: SheetHeights = { minPx: 40, peekPx: 272, maxPx: 100 };
    expect(snapAfterDrag(260, flach)).toBe("peek");
    expect(snapAfterDrag(60, flach)).toBe("versteckt");
  });
});

describe("sheetHeightFor", () => {
  it("leaves the handle standing in the hidden state", () => {
    expect(sheetHeightFor("versteckt", HEIGHTS)).toBe(40);
  });
});

describe("nextSnapOnTap", () => {
  it("opens the peeking sheet", () => {
    expect(nextSnapOnTap("peek")).toBe("voll");
  });

  it("collapses the open sheet back to the peek", () => {
    expect(nextSnapOnTap("voll")).toBe("peek");
  });

  it("brings a hidden sheet back instead of hiding it further", () => {
    expect(nextSnapOnTap("versteckt")).toBe("peek");
  });
});

describe("snapStep", () => {
  it("steps up and down one snap at a time", () => {
    expect(snapStep("versteckt", 1)).toBe("peek");
    expect(snapStep("peek", 1)).toBe("voll");
    expect(snapStep("voll", -1)).toBe("peek");
    expect(snapStep("peek", -1)).toBe("versteckt");
  });

  it("stops at the ends instead of wrapping around", () => {
    expect(snapStep("voll", 1)).toBe("voll");
    expect(snapStep("versteckt", -1)).toBe("versteckt");
  });
});

describe("decideSheetGesture", () => {
  it("expands the peeking sheet on a swipe up instead of scrolling the peek", () => {
    expect(decideSheetGesture({ deltaY: 40, deltaX: 0, snap: "peek", scrollTop: 0 })).toBe("sheet");
  });

  it("expands even when the peeking content could scroll", () => {
    expect(decideSheetGesture({ deltaY: 40, deltaX: 0, snap: "peek", scrollTop: 120 })).toBe(
      "sheet",
    );
  });

  it("brings a hidden sheet back on a swipe up", () => {
    expect(decideSheetGesture({ deltaY: 40, deltaX: 0, snap: "versteckt", scrollTop: 0 })).toBe(
      "sheet",
    );
  });

  it("scrolls the content on a swipe up once the sheet is open", () => {
    expect(decideSheetGesture({ deltaY: 40, deltaX: 0, snap: "voll", scrollTop: 0 })).toBe("scroll");
  });

  it("pushes the peeking sheet out of the way on a swipe down", () => {
    expect(decideSheetGesture({ deltaY: -40, deltaX: 0, snap: "peek", scrollTop: 0 })).toBe("sheet");
  });

  it("collapses the open sheet on a swipe down at the top of the content", () => {
    expect(decideSheetGesture({ deltaY: -40, deltaX: 0, snap: "voll", scrollTop: 0 })).toBe("sheet");
  });

  it("scrolls back to the top before moving the sheet, in every snap", () => {
    expect(decideSheetGesture({ deltaY: -40, deltaX: 0, snap: "voll", scrollTop: 200 })).toBe(
      "scroll",
    );
    expect(decideSheetGesture({ deltaY: -40, deltaX: 0, snap: "peek", scrollTop: 200 })).toBe(
      "scroll",
    );
  });

  it("leaves a horizontal swipe to the content", () => {
    expect(decideSheetGesture({ deltaY: 10, deltaX: 40, snap: "peek", scrollTop: 0 })).toBe(
      "scroll",
    );
    expect(decideSheetGesture({ deltaY: -10, deltaX: -40, snap: "voll", scrollTop: 0 })).toBe(
      "scroll",
    );
  });
});

describe("Sheet-Physik", () => {
  const heights = { minPx: 40, peekPx: 280, maxPx: 800 };

  it("throws a short fast flick up to full instead of staying on peek", () => {
    // 40 px über Peek losgelassen: ohne Schwung bliebe es auf Peek.
    expect(snapAfterDrag(320, heights)).toBe("peek");
    expect(snapAfterFling(320, 2500, heights)).toBe("voll");
  });

  it("keeps a slow release where the finger left it", () => {
    expect(snapAfterFling(320, 50, heights)).toBe("peek");
  });

  it("flicks down to hidden", () => {
    expect(snapAfterFling(260, -2500, heights)).toBe("versteckt");
  });

  it("projects about 200 px for 1000 px/s", () => {
    expect(projizierterWeg(1000)).toBeCloseTo(199, 0);
  });

  it("resists past the ends but never passes the container height", () => {
    expect(gummibandHoehe(500, heights)).toBe(500);
    const drueber = gummibandHoehe(900, heights);
    expect(drueber).toBeGreaterThan(800);
    expect(drueber).toBeLessThan(900);
    expect(gummibandHoehe(100000, heights)).toBeLessThan(1600);
    const drunter = gummibandHoehe(0, heights);
    expect(drunter).toBeLessThan(40);
    expect(drunter).toBeGreaterThan(0);
  });

  it("measures speed from the last 100 ms only", () => {
    const proben = [
      { t: 0, h: 100 },
      { t: 400, h: 400 }, // schneller Anfang, dann Stillstand:
      { t: 480, h: 400 },
      { t: 560, h: 400 },
    ];
    expect(wischGeschwindigkeit(proben)).toBe(0);
    expect(wischGeschwindigkeit([{ t: 0, h: 100 }, { t: 50, h: 200 }])).toBe(2000);
  });
});
