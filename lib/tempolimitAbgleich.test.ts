import { describe, expect, it } from "vitest";
import {
  AmtlicherIndex,
  tempolimitsAbgleichen,
  wgs84ToLv95,
  type AmtlichesObjekt,
  type Lv95,
} from "@/lib/tempolimitAbgleich";
import type { TempolimitSegment } from "@/types/database";

// Eine gerade Strecke nach Osten bei Zürich, Stützpunkte alle ~10 m
// (0.00013° Länge ≈ 9.8 m auf 47.37° N), insgesamt ~1 km.
const START: [number, number] = [8.54, 47.37];
const coords: [number, number][] = Array.from({ length: 101 }, (_, i) => [START[0] + i * 0.00013, START[1]]);
const lv = coords.map(wgs84ToLv95);
const [x0, y0] = lv[0];

// Die Strecke ist in WGS84 gerade, in LV95 aber leicht geneigt (~14 m auf
// 1 km). Amtliche Achsen werden deshalb als Versatz der Streckenpunkte
// gebaut, nicht als waagrechte Linien.
function versetzt(dy: number, von = 0, bis = lv.length - 1): Lv95[] {
  return lv.slice(von, bis + 1).map(([x, y]) => [x, y + dy]);
}

const OSM: TempolimitSegment[] = [{ km_von: 0, km_bis: 1, kmh: 80, bekannt: true }];

function linie(quelle: string, rang: number, kmh: number, punkte: Lv95[]): AmtlichesObjekt {
  return { quelle, rang, randM: 0, kmh, linien: [punkte] };
}

function abgleichen(objekte: AmtlichesObjekt[], basis = OSM) {
  return tempolimitsAbgleichen(new AmtlicherIndex(objekte), coords, basis);
}

describe("wgs84ToLv95", () => {
  it("trifft swisstopos Kontrollpunkt auf unter 1 m", () => {
    // Beispiel aus swisstopos "Näherungslösungen": 8°43'49.79" E, 46°02'38.87" N
    const [e, n] = wgs84ToLv95([8 + 43 / 60 + 49.79 / 3600, 46 + 2 / 60 + 38.87 / 3600]);
    expect(Math.abs(e - 2700000)).toBeLessThan(1);
    expect(Math.abs(n - 1100000)).toBeLessThan(1);
  });
});

describe("tempolimitsAbgleichen", () => {
  it("lässt die Kartendaten stehen, wenn keine amtliche Quelle passt", () => {
    const segmente = abgleichen([]);
    expect(segmente).toHaveLength(1);
    expect(segmente[0]).toMatchObject({ kmh: 80, bekannt: true, amtlich: false });
    expect(segmente[0].quelle).toBeUndefined();
  });

  it("übernimmt eine parallele amtliche Achse innerhalb der Toleranz", () => {
    const segmente = abgleichen([linie("zh", 2, 60, versetzt(8))]);
    expect(segmente).toHaveLength(1);
    expect(segmente[0]).toMatchObject({ km_von: 0, kmh: 60, amtlich: true, quelle: "zh" });
  });

  it("ignoriert eine Achse ausserhalb von 20 m", () => {
    const segmente = abgleichen([linie("zh", 2, 60, versetzt(30))]);
    expect(segmente.every((s) => !s.amtlich)).toBe(true);
  });

  it("übernimmt keine querende Strasse an einer Kreuzung", () => {
    const mitte = lv[50][0];
    const segmente = abgleichen([linie("zh", 2, 30, [[mitte, y0 - 200], [mitte, y0 + 200]])]);
    expect(segmente.every((s) => !s.amtlich)).toBe(true);
  });

  it("zieht den kleineren Rang vor, wenn sich Quellen überlagern", () => {
    const segmente = abgleichen([
      linie("zh", 2, 60, versetzt(2)),
      linie("stadt-zuerich", 1, 50, versetzt(12)),
    ]);
    expect(segmente).toHaveLength(1);
    expect(segmente[0]).toMatchObject({ kmh: 50, quelle: "stadt-zuerich" });
  });

  it("schliesst kurze Lücken zwischen gleichen amtlichen Abschnitten", () => {
    // Achse mit einer ~80 m langen Unterbrechung in der Mitte (Punkte 49–51
    // liegen weiter als 20 m von beiden Enden entfernt)
    const segmente = abgleichen([
      linie("zh", 2, 60, versetzt(0, 0, 46)),
      linie("zh", 2, 60, versetzt(0, 54)),
    ]);
    expect(segmente).toHaveLength(1);
    expect(segmente[0]).toMatchObject({ kmh: 60, amtlich: true });
  });

  it("schliesst keine lange Lücke und lässt die Segmente lückenlos aneinander", () => {
    const segmente = abgleichen([
      linie("zh", 2, 60, versetzt(0, 0, 30)),
      linie("zh", 2, 60, versetzt(0, 60)),
    ]);
    expect(segmente.map((s) => s.amtlich)).toEqual([true, false, true]);
    for (let i = 1; i < segmente.length; i++) expect(segmente[i].km_von).toBe(segmente[i - 1].km_bis);
  });

  it("wertet eine Zone nur, wenn der Punkt deutlich innerhalb liegt", () => {
    const ende = lv[lv.length - 1];
    const zone = (randM: number, abstand: number): AmtlichesObjekt => ({
      quelle: "zh-zonen",
      rang: 3,
      randM,
      kmh: 30,
      // Die Strecke verläuft `abstand` Meter innerhalb der Südkante.
      flaechen: [[[
        [x0 - 100, y0 - abstand],
        ...versetzt(-abstand),
        [ende[0] + 100, ende[1] - abstand],
        [ende[0] + 100, y0 + 500],
        [x0 - 100, y0 + 500],
        [x0 - 100, y0 - abstand],
      ]]],
    });
    expect(abgleichen([zone(15, 5)]).every((s) => !s.amtlich)).toBe(true);
    expect(abgleichen([zone(15, 40)])[0]).toMatchObject({ kmh: 30, amtlich: true });
    // rand_m 0 (Genf): jede Lage innerhalb zählt
    expect(abgleichen([zone(0, 5)])[0]).toMatchObject({ kmh: 30, amtlich: true });
  });

  it("beginnt bei km 0, auch wenn der erste Punkt allein steht", () => {
    // Amtlich erst ab dem zweiten Stützpunkt: das erste Segment hätte
    // km_von = km_bis = 0 und wäre nur Ballast.
    const segmente = abgleichen([linie("zh", 2, 60, versetzt(0, 1))]);
    expect(segmente[0].km_von).toBe(0);
    expect(segmente.every((x) => x.km_bis > x.km_von)).toBe(true);
  });

  it("verwirft unplausible Werte wie Fussgängerzonen", () => {
    const segmente = abgleichen([linie("biel", 1, 15, versetzt(0))]);
    expect(segmente.every((s) => !s.amtlich)).toBe(true);
  });
});
