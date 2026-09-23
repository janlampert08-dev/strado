import { describe, expect, it } from "vitest";
import { ersteStrassenEbene, helleBeruhigung, konturLayer, reliefLayer, KONTUR_AB_ZOOM } from "@/lib/kartenStil";

describe("kartenStil", () => {
  it("puts relief and contours below the first road layer", () => {
    expect(ersteStrassenEbene(["background", "landcover", "hillshade", "tunnel-street", "road-primary"])).toBe(
      "tunnel-street",
    );
    expect(ersteStrassenEbene(["background", "water"])).toBeUndefined();
  });

  it("shows contours only from zoom 11 and splits fine from major lines", () => {
    const [fein, haupt] = konturLayer("dunkel");
    expect(fein.minzoom).toBe(KONTUR_AB_ZOOM);
    expect(haupt.minzoom).toBe(KONTUR_AB_ZOOM);
    expect(JSON.stringify(haupt.filter)).toContain("[5,10]");
    expect(JSON.stringify(fein.filter)).toContain("!");
  });

  it("lights the relief from the north-west in both schemes", () => {
    expect(reliefLayer("hell", "dem").paint["hillshade-illumination-direction"]).toBe(315);
    expect(reliefLayer("dunkel", "dem").source).toBe("dem");
  });

  it("neutralises roads and green areas on the light map, leaves labels alone", () => {
    expect(helleBeruhigung({ id: "road-motorway-trunk", type: "line" })).toEqual({ "line-color": "#d9d9de" });
    expect(helleBeruhigung({ id: "road-street", type: "line" })).toEqual({ "line-color": "#ffffff" });
    expect(helleBeruhigung({ id: "road-label", type: "symbol" })).toBeNull();
    expect(helleBeruhigung({ id: "road-primary-case", type: "line" })).toBeNull();
    expect(helleBeruhigung({ id: "landcover", type: "fill" })).toEqual({ "fill-opacity": 0.35 });
    expect(helleBeruhigung({ id: "water", type: "fill" })).toBeNull();
  });
});
