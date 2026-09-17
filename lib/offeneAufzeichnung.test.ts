import { describe, it, expect } from "vitest";
import { FREE_RIDE_STORAGE_KEY, offeneAufzeichnungenAus } from "@/lib/trackingStorage";

const JETZT = 1_800_000_000_000;
const NUTZER = "11111111-1111-1111-1111-111111111111";

function snapshot(teil: Record<string, unknown>): string {
  return JSON.stringify({
    phase: "tracking",
    trail: [],
    distanceKm: 1.2,
    hasStarted: true,
    hasLeftStart: false,
    startTimeMs: JETZT - 60_000,
    savedAt: JETZT - 5_000,
    seconds: null,
    ...teil,
  });
}

describe("offeneAufzeichnungenAus", () => {
  // Der Fall, für den der Hinweis gebaut ist: mitten in der Fahrt
  // weggeklickt, und die freie Fahrt führt zurück in den Recorder.
  it("findet eine verlassene freie Fahrt und führt zu /fahrten/neu", () => {
    const offen = offeneAufzeichnungenAus(
      [[`cornice:tracking:${NUTZER}:${FREE_RIDE_STORAGE_KEY}`, snapshot({})]],
      NUTZER,
      JETZT,
    );
    expect(offen).toEqual([
      { storageKey: FREE_RIDE_STORAGE_KEY, phase: "tracking", href: "/fahrten/neu" },
    ]);
  });

  it("führt eine Streckenfahrt auf ihre Streckenseite", () => {
    const offen = offeneAufzeichnungenAus(
      [[`cornice:tracking:${NUTZER}:abc-123`, snapshot({ phase: "finished", seconds: 60 })]],
      NUTZER,
      JETZT,
    );
    expect(offen).toEqual([{ storageKey: "abc-123", phase: "finished", href: "/strecken/abc-123" }]);
  });

  // Die Nutzertrennung aus dem Schlüssel gilt auch für die Anzeige: ein
  // fremdes Konto und der Gast-Schlüssel bleiben unsichtbar.
  it("zeigt nur die Aufzeichnungen des eigenen Kontos", () => {
    const offen = offeneAufzeichnungenAus(
      [
        ["cornice:tracking:22222222-2222-2222-2222-222222222222:frei", snapshot({})],
        ["cornice:tracking:gast:frei", snapshot({})],
      ],
      NUTZER,
      JETZT,
    );
    expect(offen).toEqual([]);
  });

  it("ignoriert Altbestand, Kaputtes, Abgelaufenes und die blosse Anfahrt", () => {
    const offen = offeneAufzeichnungenAus(
      [
        ["cornice:tracking:frei", snapshot({})],
        [`cornice:tracking:${NUTZER}:kaputt`, "{nicht json"],
        [`cornice:tracking:${NUTZER}:alt`, snapshot({ savedAt: JETZT - 25 * 60 * 60 * 1000 })],
        [`cornice:tracking:${NUTZER}:anfahrt`, snapshot({ hasStarted: false })],
        [`cornice:tracking:${NUTZER}:leer`, null],
        ["cornice-theme", "dark"],
      ],
      NUTZER,
      JETZT,
    );
    expect(offen).toEqual([]);
  });
});
