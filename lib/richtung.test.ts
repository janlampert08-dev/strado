import { describe, expect, it } from "vitest";
import { erkannteFahrtrichtung } from "@/lib/richtung";

const START: [number, number] = [8.5, 47.37];
const ZIEL: [number, number] = [8.6, 47.37];

describe("erkannteFahrtrichtung", () => {
  it("meldet hin bei Start am Streckenanfang", () => {
    expect(erkannteFahrtrichtung(START, START, ZIEL, false)).toBe("hin");
  });

  it("meldet zurueck bei Start am Streckenende", () => {
    expect(erkannteFahrtrichtung(ZIEL, START, ZIEL, false)).toBe("zurueck");
  });

  it("schweigt bei Rundfahrten", () => {
    expect(erkannteFahrtrichtung(START, START, START, true)).toBeNull();
  });

  it("schweigt ohne Track und bei unklarem Start", () => {
    expect(erkannteFahrtrichtung(null, START, ZIEL, false)).toBeNull();
    // Mitten auf der Strecke: weder noch.
    expect(erkannteFahrtrichtung([8.55, 47.37], START, ZIEL, false)).toBeNull();
  });

  it("rät nicht bei Start- und Zielnähe zugleich", () => {
    // Kurze Strecke, Start und Ziel in Toleranz: keine Aussage.
    expect(erkannteFahrtrichtung(START, START, [8.501, 47.37], false)).toBeNull();
  });
});
