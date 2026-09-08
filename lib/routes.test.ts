import { describe, expect, it } from "vitest";
import { KONTEXT_MAX_STRECKEN, waehleKontextStrecken } from "@/lib/routes";
import type { KartenStrecke } from "@/types/database";

// Eine Strecke als gerade Linie von (lng, lat) über laengeGrad nach Osten.
// Mehr braucht die Auswahl nicht: sie misst Rechtecke, keine Kurven.
function strecke(id: string, lng: number, lat: number, laengeGrad = 0.01): KartenStrecke {
  const coords: [number, number][] = [
    [lng, lat],
    [lng + laengeGrad, lat],
  ];
  return {
    id,
    name: id,
    start_geojson: { type: "Point", coordinates: coords[0] },
    ziel_geojson: { type: "Point", coordinates: coords[1] },
    geometry_geojson: { type: "LineString", coordinates: coords },
    ist_rundfahrt: false,
  };
}

// Eine Strecke als senkrechte Linie: ein Längengrad, ein Breitenband.
// Gebraucht für den Fall, in dem sich die Breitenbänder überlappen und
// erst der gewählte Breitengrad über den Abstand entscheidet.
function nordSuedStrecke(id: string, lng: number, latVon: number, latBis: number): KartenStrecke {
  const coords: [number, number][] = [
    [lng, latVon],
    [lng, latBis],
  ];
  return {
    id,
    name: id,
    start_geojson: { type: "Point", coordinates: coords[0] },
    ziel_geojson: { type: "Point", coordinates: coords[1] },
    geometry_geojson: { type: "LineString", coordinates: coords },
    ist_rundfahrt: false,
  };
}

describe("waehleKontextStrecken", () => {
  const gefahren = strecke("gefahren", 8.5, 47.37);

  it("lässt die gefahrene Strecke selbst aus", () => {
    const auswahl = waehleKontextStrecken([gefahren, strecke("nachbar", 8.52, 47.37)], gefahren);
    expect(auswahl.map((s) => s.id)).toEqual(["nachbar"]);
  });

  it("nimmt eine lange Strecke auf, die nah vorbeiführt", () => {
    // Der Mittelpunkt dieser Strecke liegt rund 55 km östlich, sie beginnt
    // aber gleich nebenan. Über Mittelpunkte gemessen fiele sie heraus —
    // genau der Fall, für den der Abstand über die Rechtecke gemessen wird.
    const lang = strecke("lang", 8.6, 47.37, 1.4);
    const auswahl = waehleKontextStrecken([lang], gefahren);
    expect(auswahl.map((s) => s.id)).toEqual(["lang"]);
  });

  it("misst bei überlappenden Breitenbändern am nächsten, nicht am südlichsten Punkt", () => {
    // Zwei parallele Nord-Süd-Strecken, 0.33° Länge auseinander, beide über
    // dasselbe Breitenband von 45° bis 60°. Weil Meridiane nach Norden
    // zusammenlaufen, sind das am Südrand rund 26 km und am Nordrand rund
    // 18 km. Der nächste Punkt liegt also im Norden und damit innerhalb des
    // Umkreises. Wer stattdessen den Südrand misst — max(aMin, bMin), wie
    // es die erste Fassung tat — bekommt über 25 km und wirft die Strecke
    // heraus, obwohl sie die ganze Zeit nebenan verläuft.
    const bezug = nordSuedStrecke("bezug", 8.0, 45, 60);
    const parallel = nordSuedStrecke("parallel", 8.33, 45, 60);
    expect(waehleKontextStrecken([parallel], bezug).map((s) => s.id)).toEqual(["parallel"]);
  });

  it("lässt weit entfernte Strecken weg", () => {
    const fern = strecke("fern", 10.5, 47.37);
    expect(waehleKontextStrecken([fern], gefahren)).toEqual([]);
  });

  it("sortiert nach Abstand und begrenzt die Anzahl", () => {
    const viele = Array.from({ length: KONTEXT_MAX_STRECKEN + 5 }, (_, i) =>
      strecke(`s${i}`, 8.5 + (i + 1) * 0.01, 47.37),
    );
    const auswahl = waehleKontextStrecken([...viele].reverse(), gefahren);
    expect(auswahl).toHaveLength(KONTEXT_MAX_STRECKEN);
    expect(auswahl[0].id).toBe("s0");
  });

  it("überspringt Strecken ohne brauchbare Geometrie", () => {
    const leer = { ...strecke("leer", 8.51, 47.37) };
    leer.geometry_geojson = { type: "LineString", coordinates: [] };
    const auswahl = waehleKontextStrecken([leer, strecke("gut", 8.52, 47.37)], gefahren);
    expect(auswahl.map((s) => s.id)).toEqual(["gut"]);
  });
});
