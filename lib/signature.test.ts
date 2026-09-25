import { describe, expect, it } from "vitest";
import { computeSignatures } from "@/lib/signature";
import type { ExploreRoute, SignaturStrecke } from "@/types/database";

// ExploreRoute trägt seit der serverseitigen Signatur keine Tempolimits
// mehr; computeSignatures() liest sie aber — daher die Schnittmenge.
type Zeile = ExploreRoute & SignaturStrecke;

function strecke(over: Partial<Zeile> & { id: string }): Zeile {
  return {
    name: "Teststrecke",
    region: "Kanton Zürich",
    start_ort: "A",
    ziel_ort: "B",
    start_geojson: { type: "Point", coordinates: [8.5, 47.4] },
    ziel_geojson: { type: "Point", coordinates: [8.6, 47.5] },
    geometry_geojson: {
      type: "LineString",
      coordinates: [
        [8.5, 47.4],
        [8.6, 47.5],
      ],
    },
    hoehe_m: null,
    laenge_km: 10,
    max_steigung_prozent: null,
    kehren: null,
    saison_status: null,
    tempolimits: null,
    ist_rundfahrt: false,
    ...over,
  } as Zeile;
}

describe("computeSignatures", () => {
  // Das Label steht auf jeder Karte der Streckenliste auf der Startseite.
  it("schreibt die Einzahl bei genau einer Kehre", () => {
    const sig = computeSignatures([
      strecke({ id: "eine", kehren: 1, laenge_km: 2 }),
      strecke({ id: "keine", kehren: 0, laenge_km: 40 }),
    ]);
    expect(sig.get("eine")?.key).toBe("kehren");
    expect(sig.get("eine")?.label).toBe("1 Kehre");
  });

  it("schreibt die Mehrzahl ab zwei Kehren", () => {
    const sig = computeSignatures([
      strecke({ id: "viele", kehren: 13, laenge_km: 16.7 }),
      strecke({ id: "keine", kehren: 0, laenge_km: 40 }),
    ]);
    expect(sig.get("viele")?.label).toBe("13 Kehren");
  });

  it("fällt ohne jedes Merkmal auf die Länge zurück", () => {
    const sig = computeSignatures([strecke({ id: "nackt", laenge_km: 7.5 })]);
    expect(sig.get("nackt")?.key).toBe("laenge");
    expect(sig.get("nackt")?.label).toBe("8 km lang");
  });
});
