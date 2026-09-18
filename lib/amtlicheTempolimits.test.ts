import { describe, expect, it, vi } from "vitest";
import { mitAmtlichenTempolimits, zuObjekt, type AmtlicheZeile } from "@/lib/amtlicheTempolimits";
import { wgs84ToLv95 } from "@/lib/tempolimitAbgleich";
import type { GeoLineString, TempolimitSegment } from "@/types/database";

const geometry: GeoLineString = {
  type: "LineString",
  coordinates: Array.from({ length: 51 }, (_, i) => [8.54 + i * 0.00013, 47.37] as [number, number]),
};
const basis: TempolimitSegment[] = [{ km_von: 0, km_bis: 0.5, kmh: 80, bekannt: false }];
const [x0, y0] = wgs84ToLv95(geometry.coordinates[0]);

function client(result: { data: AmtlicheZeile[] | null; error: { message: string } | null }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("mitAmtlichenTempolimits", () => {
  it("setzt amtliche Werte aus der Datenbank ein", async () => {
    const supabase = client({
      data: [
        {
          quelle: "zh",
          rang: 2,
          rand_m: 0,
          kmh: 50,
          geom_geojson: { type: "LineString", coordinates: [[x0 - 20, y0 + 3], [x0 + 600, y0 + 3]] },
        },
      ],
      error: null,
    });
    const segmente = await mitAmtlichenTempolimits(supabase, geometry, basis);
    expect(supabase.rpc).toHaveBeenCalledWith("amtliche_tempolimits_entlang", { p_geometry_geojson: geometry });
    expect(segmente).toEqual([{ km_von: 0, km_bis: 0.49, kmh: 50, bekannt: true, amtlich: true, quelle: "zh" }]);
  });

  it("behält die Werte des Clients, wenn die Abfrage scheitert", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const segmente = await mitAmtlichenTempolimits(client({ data: null, error: { message: "timeout" } }), geometry, basis);
    expect(segmente).toBe(basis);
    spy.mockRestore();
  });

  it("behält die Werte des Clients ausserhalb jeder Quelle", async () => {
    const segmente = await mitAmtlichenTempolimits(client({ data: [], error: null }), geometry, basis);
    expect(segmente).toBe(basis);
  });
});

describe("zuObjekt", () => {
  const zeile = (geom_geojson: AmtlicheZeile["geom_geojson"]): AmtlicheZeile => ({ quelle: "ge", rang: 2, rand_m: 0, kmh: 30, geom_geojson });

  it("verwirft Punkte und leere Schnitte aus ST_Intersection", () => {
    expect(zuObjekt(zeile({ type: "Point", coordinates: [1, 2] }))).toBeNull();
    expect(zuObjekt(zeile({ type: "GeometryCollection", coordinates: [] }))).toBeNull();
    expect(zuObjekt(zeile(null))).toBeNull();
  });

  it("vereinheitlicht einfache und Multi-Geometrien", () => {
    expect(zuObjekt(zeile({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }))).toMatchObject({
      flaechen: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
      randM: 0,
    });
    expect(zuObjekt(zeile({ type: "MultiLineString", coordinates: [[[0, 0], [1, 1]]] }))).toMatchObject({
      linien: [[[0, 0], [1, 1]]],
    });
  });
});
