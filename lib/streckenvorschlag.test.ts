import { describe, it, expect } from "vitest";
import {
  naechsteStreckeAmStart,
  vorschlagsText,
  VORSCHLAG_RADIUS_M,
  VORSCHLAG_MAX_UNGENAUIGKEIT_M,
  type VorschlagsStrecke,
} from "@/lib/streckenvorschlag";

// Ein Breitengrad sind rund 111,2 km — damit lassen sich Abstände nach Norden
// ohne Umweg über eine zweite Formel bauen.
const METER_PRO_GRAD_BREITE = 111_195;
const CAFE: [number, number] = [8.85, 46.87];

function nordVon([lng, lat]: [number, number], meter: number): [number, number] {
  return [lng, lat + meter / METER_PRO_GRAD_BREITE];
}

function strecke(id: string, start: [number, number]): VorschlagsStrecke {
  return { id, name: `Strecke ${id}`, start_geojson: { coordinates: start } };
}

describe("naechsteStreckeAmStart", () => {
  it("schlägt eine Strecke vor, deren Start 400 m entfernt liegt", () => {
    const v = naechsteStreckeAmStart(CAFE, 8, [strecke("a", nordVon(CAFE, 400))]);
    expect(v?.id).toBe("a");
    expect(v?.distanzM).toBeCloseTo(400, -1);
  });

  it("schweigt ausserhalb des Radius", () => {
    expect(
      naechsteStreckeAmStart(CAFE, 8, [strecke("a", nordVon(CAFE, VORSCHLAG_RADIUS_M + 50))]),
    ).toBeNull();
  });

  it("nimmt die nächste von mehreren", () => {
    const v = naechsteStreckeAmStart(CAFE, 8, [
      strecke("weit", nordVon(CAFE, 550)),
      strecke("nah", nordVon(CAFE, 120)),
      strecke("mitte", nordVon(CAFE, 300)),
    ]);
    expect(v?.id).toBe("nah");
  });

  // Nur der Start zählt: das Ziel einer Strecke direkt neben dem Café ist
  // kein Grund für einen Vorschlag, weil dort keine Zeitmessung beginnt.
  it("schaut nur auf den Startpunkt", () => {
    const s = {
      ...strecke("a", nordVon(CAFE, 5000)),
      ziel_geojson: { coordinates: nordVon(CAFE, 50) },
    };
    expect(naechsteStreckeAmStart(CAFE, 8, [s])).toBeNull();
  });

  it("schweigt ohne Standort oder ohne Genauigkeit", () => {
    const s = [strecke("a", nordVon(CAFE, 100))];
    expect(naechsteStreckeAmStart(null, 8, s)).toBeNull();
    expect(naechsteStreckeAmStart(CAFE, null, s)).toBeNull();
  });

  // Eine Funkzellen-Ortung liegt oft Kilometer daneben — dann wäre
  // "startet 100 m von dir" geraten.
  it("schweigt bei zu ungenauem Standort", () => {
    const s = [strecke("a", nordVon(CAFE, 100))];
    expect(naechsteStreckeAmStart(CAFE, VORSCHLAG_MAX_UNGENAUIGKEIT_M, s)?.id).toBe("a");
    expect(naechsteStreckeAmStart(CAFE, VORSCHLAG_MAX_UNGENAUIGKEIT_M + 1, s)).toBeNull();
  });

  it("übergeht Zeilen ohne brauchbaren Startpunkt", () => {
    const kaputt = {
      id: "x",
      name: "Kaputt",
      start_geojson: { coordinates: [Number.NaN, Number.NaN] as [number, number] },
    };
    const v = naechsteStreckeAmStart(CAFE, 8, [kaputt, strecke("a", nordVon(CAFE, 200))]);
    expect(v?.id).toBe("a");
  });

  it("gibt ohne Strecken null zurück", () => {
    expect(naechsteStreckeAmStart(CAFE, 8, [])).toBeNull();
  });
});

describe("vorschlagsText", () => {
  it("rundet auf 50 m", () => {
    expect(vorschlagsText({ id: "a", name: "Klausenpass", distanzM: 412 })).toBe(
      "Klausenpass startet 400 m von dir – als Streckenfahrt fahren?",
    );
    expect(vorschlagsText({ id: "a", name: "Klausenpass", distanzM: 580 })).toBe(
      "Klausenpass startet 600 m von dir – als Streckenfahrt fahren?",
    );
  });

  it("sagt 'hier' statt '0 m'", () => {
    expect(vorschlagsText({ id: "a", name: "Klausenpass", distanzM: 20 })).toBe(
      "Klausenpass startet hier – als Streckenfahrt fahren?",
    );
  });
});
