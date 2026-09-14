import { describe, expect, it } from "vitest";
import { buildGoogleMapsUrl } from "@/lib/googleMaps";
import type { RouteGeoJSON } from "@/types/database";

function makeRoute(overrides: Partial<RouteGeoJSON> = {}): RouteGeoJSON {
  return {
    id: "test-id",
    name: "Julierpass",
    region: "Graubünden",
    start_ort: "Tiefencastel",
    ziel_ort: "Silvaplana",
    start_geojson: { type: "Point", coordinates: [9.5, 46.65] },
    ziel_geojson: { type: "Point", coordinates: [9.8, 46.47] },
    geometry_geojson: {
      type: "LineString",
      coordinates: [
        [9.5, 46.65],
        [9.6, 46.6],
        [9.7, 46.55],
        [9.8, 46.47],
      ],
    },
    hoehe_m: 2283,
    laenge_km: 37.9,
    max_steigung_prozent: 12,
    kehren: 26,
    kategorien: ["passstrasse"],
    saison_status: "saisonal",
    status_ok: true,
    charakter_text: null,
    tempolimits: null,
    hoehenprofil: null,
    ist_rundfahrt: false,
    erstellt_von: null,
    created_at: new Date().toISOString(),
    ist_privat: false,
    ...overrides,
  };
}

function waypointsOf(url: string): string[] {
  const raw = new URL(url).searchParams.get("waypoints");
  return raw ? raw.split("|") : [];
}

describe("buildGoogleMapsUrl", () => {
  it("builds a directions URL with lat,lon origin/destination in that order", () => {
    const url = buildGoogleMapsUrl(makeRoute());
    const params = new URL(url).searchParams;
    expect(params.get("origin")).toBe("46.65000,9.50000");
    expect(params.get("destination")).toBe("46.47000,9.80000");
    expect(params.get("travelmode")).toBe("driving");
  });

  it("includes intermediate waypoints for a multi-point geometry", () => {
    const url = buildGoogleMapsUrl(makeRoute());
    expect(waypointsOf(url).length).toBeGreaterThan(0);
  });

  it("omits waypoints when the geometry has no intermediate points", () => {
    const url = buildGoogleMapsUrl(
      makeRoute({
        geometry_geojson: {
          type: "LineString",
          coordinates: [
            [9.5, 46.65],
            [9.8, 46.47],
          ],
        },
      }),
    );
    expect(new URL(url).searchParams.has("waypoints")).toBe(false);
  });

  // Der eigentliche Bug: Google erlaubt auf mobilen Browsern nur drei
  // Zwischenziele. Mit acht kam auf dem Handy entweder eine Strecke ohne
  // Zwischenziele an oder gar keine.
  it("never sends more than three waypoints, however dense the geometry is", () => {
    const coordinates: [number, number][] = Array.from({ length: 500 }, (_, i) => [
      9.5 + i * 0.001,
      46.65 - i * 0.0004,
    ]);
    const url = buildGoogleMapsUrl(
      makeRoute({ geometry_geojson: { type: "LineString", coordinates } }),
    );
    expect(waypointsOf(url)).toHaveLength(3);
  });

  it("stays well under the 2048-character limit for a dense geometry", () => {
    const coordinates: [number, number][] = Array.from({ length: 5000 }, (_, i) => [
      9.512345678901234 + i * 0.0001,
      46.654321098765432 - i * 0.00004,
    ]);
    const url = buildGoogleMapsUrl(
      makeRoute({ geometry_geojson: { type: "LineString", coordinates } }),
    );
    expect(url.length).toBeLessThan(2048);
  });

  it("rounds coordinates to five decimals instead of passing full precision through", () => {
    const url = buildGoogleMapsUrl(
      makeRoute({ start_geojson: { type: "Point", coordinates: [9.512345678901234, 46.654321098765432] } }),
    );
    expect(new URL(url).searchParams.get("origin")).toBe("46.65432,9.51235");
  });

  // Stützpunkte liegen im ersten Kilometer dicht (Kehren) und danach weit
  // auseinander (Gerade). Eine Auswahl über den Index läge komplett im ersten
  // Kilometer; verteilt wird nach Distanz, also über die ganze Strecke.
  it("spreads waypoints along the distance, not along the coordinate index", () => {
    const dichterAnfang: [number, number][] = Array.from({ length: 60 }, (_, i) => [
      9.5 + i * 0.0002,
      46.65,
    ]);
    const weiteGerade: [number, number][] = Array.from({ length: 5 }, (_, i) => [
      9.512 + (i + 1) * 0.06,
      46.65,
    ]);
    const coordinates = [...dichterAnfang, ...weiteGerade];
    const url = buildGoogleMapsUrl(
      makeRoute({
        geometry_geojson: { type: "LineString", coordinates },
        ziel_geojson: { type: "Point", coordinates: coordinates[coordinates.length - 1] },
      }),
    );
    const lons = waypointsOf(url).map((p) => Number(p.split(",")[1]));
    expect(lons).toHaveLength(3);
    // Mindestens ein Zwischenziel muss jenseits des dichten Anfangs liegen.
    expect(lons.some((lon) => lon > 9.52)).toBe(true);
    expect(lons).toEqual([...lons].sort((a, b) => a - b));
  });

  it("keeps waypoints for a round trip, where origin and destination are the same point", () => {
    const coordinates: [number, number][] = [
      [9.5, 46.65],
      [9.55, 46.68],
      [9.6, 46.65],
      [9.55, 46.62],
      [9.5, 46.65],
    ];
    const url = buildGoogleMapsUrl(
      makeRoute({
        ist_rundfahrt: true,
        geometry_geojson: { type: "LineString", coordinates },
        start_geojson: { type: "Point", coordinates: [9.5, 46.65] },
        ziel_geojson: { type: "Point", coordinates: [9.5, 46.65] },
      }),
    );
    const params = new URL(url).searchParams;
    expect(params.get("origin")).toBe(params.get("destination"));
    expect(waypointsOf(url).length).toBeGreaterThan(0);
  });

  it("emits no NaN and no waypoints for a degenerate geometry", () => {
    for (const coordinates of [[], [[9.5, 46.65]] as [number, number][], [
      [9.5, 46.65],
      [9.5, 46.65],
      [9.5, 46.65],
    ] as [number, number][]]) {
      const url = buildGoogleMapsUrl(
        makeRoute({ geometry_geojson: { type: "LineString", coordinates } }),
      );
      expect(url).not.toContain("NaN");
      expect(new URL(url).searchParams.has("waypoints")).toBe(false);
    }
  });
});
