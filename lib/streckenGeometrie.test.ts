import { describe, expect, it, vi } from "vitest";
import { encodePolyline } from "@/lib/polyline";
import {
  CACHE_OEFFENTLICH,
  CACHE_PRIVAT,
  erzeugeGeometrieLader,
  geometrieCacheControl,
  geometrieUrl,
  geometrieVersion,
  kodiereGeometrie,
  leseGeometrieAntwort,
  mitUebersichtsgeometrie,
} from "@/lib/streckenGeometrie";
import type { GeoLineString } from "@/types/database";

const VOLL: GeoLineString = {
  type: "LineString",
  coordinates: [
    [9.746065, 46.629993],
    [9.746073, 46.630029],
    [9.746078, 46.63012],
    [9.8, 46.6],
  ],
};
const UEBERSICHT: GeoLineString = {
  type: "LineString",
  coordinates: [
    [9.746065, 46.629993],
    [9.8, 46.6],
  ],
};

describe("geometrieVersion / kodiereGeometrie", () => {
  it("gibt für dieselbe Linie dieselbe Version", () => {
    expect(kodiereGeometrie(VOLL)).toEqual(kodiereGeometrie(structuredClone(VOLL)));
  });

  it("ändert die Version, sobald sich ein Punkt merklich verschiebt", () => {
    const verschoben = structuredClone(VOLL);
    verschoben.coordinates[2] = [9.74609, 46.63012];
    expect(kodiereGeometrie(verschoben).v).not.toBe(kodiereGeometrie(VOLL).v);
  });

  it("ist eine kurze, URL-taugliche Zeichenkette", () => {
    const v = geometrieVersion(encodePolyline(VOLL.coordinates));
    expect(v).toMatch(/^[0-9a-z]{1,12}$/);
  });

  it("liefert die Polyline der vollen Linie mit", () => {
    expect(kodiereGeometrie(VOLL).p).toBe(encodePolyline(VOLL.coordinates));
  });
});

describe("geometrieCacheControl", () => {
  const basis = { status_ok: true, ist_privat: false, angefragteVersion: "v1", version: "v1" };

  it("cacht eine freigegebene, öffentliche Strecke mit passender Version ein Jahr", () => {
    expect(geometrieCacheControl(basis)).toBe(CACHE_OEFFENTLICH);
    expect(CACHE_OEFFENTLICH).toBe("public, max-age=31536000, immutable");
  });

  it("cacht eine private Strecke nirgends", () => {
    expect(geometrieCacheControl({ ...basis, ist_privat: true })).toBe(CACHE_PRIVAT);
  });

  it("cacht eine noch nicht freigegebene Strecke nirgends", () => {
    expect(geometrieCacheControl({ ...basis, status_ok: false })).toBe(CACHE_PRIVAT);
  });

  it("cacht nicht unter einer fremden, veralteten oder fehlenden Version", () => {
    expect(geometrieCacheControl({ ...basis, angefragteVersion: "alt" })).toBe(CACHE_PRIVAT);
    expect(geometrieCacheControl({ ...basis, angefragteVersion: null })).toBe(CACHE_PRIVAT);
  });

  it("verbietet für alles andere jedes Speichern", () => {
    expect(CACHE_PRIVAT).toBe("private, no-store");
  });
});

describe("geometrieUrl", () => {
  it("baut die Adresse ausserhalb von /api/strecken", () => {
    const url = geometrieUrl("081bbea9-06c2-4789-9dfa-ff81867c0dee", "abc123");
    expect(url).toBe("/strecken/081bbea9-06c2-4789-9dfa-ff81867c0dee/geometrie?v=abc123");
    expect(url.startsWith("/api/")).toBe(false);
  });

  it("maskiert, was nicht in eine Adresse gehört", () => {
    expect(geometrieUrl("a/b", "x&y")).toBe("/strecken/a%2Fb/geometrie?v=x%26y");
  });
});

describe("mitUebersichtsgeometrie", () => {
  it("setzt die Übersicht ein und nimmt die Zusatzspalte heraus", () => {
    const leicht = mitUebersichtsgeometrie({
      id: "x",
      geometry_geojson: VOLL,
      geometry_uebersicht_geojson: UEBERSICHT,
    });
    expect(leicht.geometry_geojson).toBe(UEBERSICHT);
    expect("geometry_uebersicht_geojson" in leicht).toBe(false);
    expect(leicht.id).toBe("x");
  });

  it("behält die volle Linie, wenn die Übersicht fehlt (vor 0117) oder null ist", () => {
    expect(mitUebersichtsgeometrie({ geometry_geojson: VOLL }).geometry_geojson).toBe(VOLL);
    expect(
      mitUebersichtsgeometrie({ geometry_geojson: VOLL, geometry_uebersicht_geojson: null })
        .geometry_geojson,
    ).toBe(VOLL);
  });

  it("behält die volle Linie bei einer entarteten Übersicht", () => {
    const entartet: GeoLineString = { type: "LineString", coordinates: [[9.7, 46.6]] };
    expect(
      mitUebersichtsgeometrie({ geometry_geojson: VOLL, geometry_uebersicht_geojson: entartet })
        .geometry_geojson,
    ).toBe(VOLL);
  });
});

describe("leseGeometrieAntwort", () => {
  it("dekodiert eine gültige Antwort", () => {
    const punkte = leseGeometrieAntwort(kodiereGeometrie(VOLL));
    expect(punkte).toHaveLength(VOLL.coordinates.length);
    expect(punkte![0][0]).toBeCloseTo(9.74607, 5);
    expect(punkte![0][1]).toBeCloseTo(46.62999, 5);
  });

  it("lehnt alles ab, was keine Linie mit zwei Punkten ergibt", () => {
    expect(leseGeometrieAntwort(null)).toBeNull();
    expect(leseGeometrieAntwort("p")).toBeNull();
    expect(leseGeometrieAntwort({})).toBeNull();
    expect(leseGeometrieAntwort({ p: 42 })).toBeNull();
    expect(leseGeometrieAntwort({ p: "" })).toBeNull();
    expect(leseGeometrieAntwort({ p: encodePolyline([[9.7, 46.6]]) })).toBeNull();
    // abgeschnitten
    expect(leseGeometrieAntwort({ p: kodiereGeometrie(VOLL).p.slice(0, -1) })).toBeNull();
  });

  it("lehnt Koordinaten ausserhalb der Welt ab", () => {
    expect(
      leseGeometrieAntwort({
        p: encodePolyline([
          [9.7, 46.6],
          [200, 46.6],
        ]),
      }),
    ).toBeNull();
  });
});

describe("erzeugeGeometrieLader", () => {
  const antwort = (json: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(json) });

  it("teilt sich einen Abruf zwischen gleichzeitigen Aufrufern und merkt sich das Ergebnis", async () => {
    const abruf = vi.fn(() => antwort(kodiereGeometrie(VOLL)));
    const lader = erzeugeGeometrieLader(abruf);
    expect(lader.bekannt("/a")).toBeNull();
    const [eins, zwei] = await Promise.all([lader.laden("/a"), lader.laden("/a")]);
    expect(eins).toBe(zwei);
    expect(await lader.laden("/a")).toBe(eins);
    expect(lader.bekannt("/a")).toBe(eins);
    expect(abruf).toHaveBeenCalledTimes(1);
  });

  it("hält verschiedene Adressen auseinander", async () => {
    const abruf = vi.fn((url: string) =>
      antwort(kodiereGeometrie(url === "/voll" ? VOLL : UEBERSICHT)),
    );
    const lader = erzeugeGeometrieLader(abruf);
    expect(await lader.laden("/voll")).toHaveLength(4);
    expect(await lader.laden("/kurz")).toHaveLength(2);
  });

  it("wirft bei einer Fehlerantwort und versucht es beim nächsten Mal neu", async () => {
    const abruf = vi
      .fn()
      .mockImplementationOnce(() => antwort({ error: "Strecke nicht gefunden" }, false))
      .mockImplementationOnce(() => Promise.reject(new TypeError("offline")))
      .mockImplementationOnce(() => antwort(kodiereGeometrie(VOLL)));
    const lader = erzeugeGeometrieLader(abruf);
    await expect(lader.laden("/a")).rejects.toThrow();
    expect(lader.bekannt("/a")).toBeNull();
    await expect(lader.laden("/a")).rejects.toThrow();
    expect(await lader.laden("/a")).toHaveLength(4);
    expect(abruf).toHaveBeenCalledTimes(3);
  });

  it("wirft bei einer unlesbaren Antwort", async () => {
    const lader = erzeugeGeometrieLader(() => antwort({ p: "  " }));
    await expect(lader.laden("/a")).rejects.toThrow();
  });
});
