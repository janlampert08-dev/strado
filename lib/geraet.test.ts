import { describe, expect, it } from "vitest";
import { erkenneGeraet, fahrHinweise, standortAnleitung } from "@/lib/geraet";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
const IPAD_ALS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

describe("erkenneGeraet", () => {
  it("erkennt das iPhone", () => {
    expect(erkenneGeraet({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false })).toEqual({
      plattform: "ios",
      standalone: false,
    });
  });

  it("erkennt das iPad, das sich als Mac ausgibt, am Touchscreen", () => {
    expect(erkenneGeraet({ userAgent: IPAD_ALS_MAC, maxTouchPoints: 5, standalone: true }).plattform).toBe("ios");
  });

  it("hält einen echten Mac nicht für ein iPad", () => {
    expect(erkenneGeraet({ userAgent: IPAD_ALS_MAC, maxTouchPoints: 0, standalone: false }).plattform).toBe("desktop");
  });

  it("erkennt Android und den Desktop", () => {
    expect(erkenneGeraet({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false }).plattform).toBe("android");
    expect(erkenneGeraet({ userAgent: WINDOWS, maxTouchPoints: 0, standalone: false }).plattform).toBe("desktop");
  });
});

describe("standortAnleitung", () => {
  it("führt auf dem iPhone über die Einstellungen-App, nicht über Safaris Menü", () => {
    expect(standortAnleitung({ plattform: "ios", standalone: false })).toContain("Apps › Safari › Standort");
    expect(standortAnleitung({ plattform: "ios", standalone: true })).toContain("Ortungsdienste");
  });

  it("schickt die installierte Android-App nicht zu einer Adressleiste, die sie nicht hat", () => {
    expect(standortAnleitung({ plattform: "android", standalone: true })).not.toContain("Adresse");
    expect(standortAnleitung({ plattform: "android", standalone: true })).toContain("App-Info");
  });

  it("sagt jedem Gerät, dass danach neu geladen oder geöffnet werden muss", () => {
    for (const geraet of [
      { plattform: "ios", standalone: false },
      { plattform: "ios", standalone: true },
      { plattform: "android", standalone: false },
      { plattform: "android", standalone: true },
      { plattform: "desktop", standalone: false },
    ] as const) {
      expect(standortAnleitung(geraet)).toMatch(/neu (laden|öffnen)\.$/);
    }
  });
});

describe("fahrHinweise", () => {
  it("nennt Standort, Bildschirm und Halterung in dieser Reihenfolge", () => {
    expect(fahrHinweise({ plattform: "android", standalone: false }).map((h) => h.id)).toEqual([
      "standort",
      "bildschirm",
      "halterung",
    ]);
  });

  it("sagt auf dem iPhone, dass die Aufzeichnung ohne Bildschirm stoppt", () => {
    const bildschirm = (plattform: "ios" | "android") =>
      fahrHinweise({ plattform, standalone: false }).find((h) => h.id === "bildschirm")!.text;
    expect(bildschirm("ios")).toContain("stoppt die Aufzeichnung");
    expect(bildschirm("android")).not.toContain("iPhone");
  });
});
