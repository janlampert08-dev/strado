import { describe, expect, it } from "vitest";
import {
  anLueckenTeilen,
  ausduennen,
  gpxLesen,
  IMPORT_ZIEL_PUNKTE,
  TRENN_LUECKE_SEKUNDEN,
} from "@/lib/gpxImport";
import type { TrailPoint } from "@/lib/geo";

// Eine gerade Linie nach Norden, ein Punkt alle `sekunden` Sekunden, je etwa
// `meter` Meter auseinander (0.000009° Breite ≈ 1 m).
function linie(
  anzahl: number,
  { start = Date.UTC(2026, 6, 12, 8, 0, 0), sekunden = 5, meter = 100, lat0 = 46.8 } = {},
): TrailPoint[] {
  return Array.from({ length: anzahl }, (_, i) => ({
    lng: 8.6,
    lat: lat0 + i * meter * 0.000009,
    t: start + i * sekunden * 1000,
  }));
}

function gpx(punkte: TrailPoint[], { name = "Klausen", mitZeit = true } = {}): string {
  const trkpts = punkte
    .map(
      (p) =>
        `<trkpt lat="${p.lat}" lon="${p.lng}"><ele>1200</ele>${
          mitZeit ? `<time>${new Date(p.t).toISOString()}</time>` : ""
        }</trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0"?>
<gpx version="1.1" creator="Test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${name}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

describe("gpxLesen", () => {
  it("liest eine gewöhnliche Aufzeichnung als eine Fahrt", () => {
    const ergebnis = gpxLesen(gpx(linie(200)));
    if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
    expect(ergebnis.fahrten).toHaveLength(1);
    const [fahrt] = ergebnis.fahrten;
    expect(fahrt.name).toBe("Klausen");
    expect(fahrt.punkte).toHaveLength(200);
    expect(fahrt.distanzKm).toBeGreaterThan(19);
    expect(fahrt.distanzKm).toBeLessThan(21);
    expect(fahrt.dauerSekunden).toBe(199 * 5);
    expect(fahrt.startMs).toBe(Date.UTC(2026, 6, 12, 8, 0, 0));
  });

  it("lehnt eine geplante Route ohne Zeitstempel mit Erklärung ab", () => {
    const route = `<gpx><rte><rtept lat="46.8" lon="8.6"/><rtept lat="46.9" lon="8.6"/></rte></gpx>`;
    expect(gpxLesen(route)).toEqual({ fehler: expect.stringContaining("geplante Route") });
    expect(gpxLesen(gpx(linie(50), { mitZeit: false }))).toEqual({
      fehler: expect.stringContaining("keine Zeitstempel"),
    });
  });

  it("lehnt etwas ab, das kein GPX ist", () => {
    expect(gpxLesen("<kml></kml>")).toEqual({ fehler: "Das ist keine GPX-Datei." });
  });

  it("versteht Namensraum-Präfixe, einfache Anführungszeichen und Entitäten", () => {
    const punkte = linie(30);
    const xml = `<gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1">
<gpx:trk><gpx:name>Pragel &amp; Klöntal</gpx:name><gpx:trkseg>
${punkte
  .map(
    (p) =>
      `<gpx:trkpt lon='${p.lng}' lat='${p.lat}'><gpx:time>${new Date(p.t).toISOString()}</gpx:time></gpx:trkpt>`,
  )
  .join("")}
</gpx:trkseg></gpx:trk></gpx:gpx>`;
    const ergebnis = gpxLesen(xml);
    if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
    expect(ergebnis.fahrten[0].name).toBe("Pragel & Klöntal");
    expect(ergebnis.fahrten[0].punkte).toHaveLength(30);
  });

  it("sortiert nach Zeit und verwirft doppelte Zeitstempel", () => {
    const punkte = linie(40);
    const durcheinander = [...punkte.slice(20), ...punkte.slice(0, 20), punkte[5]];
    const ergebnis = gpxLesen(gpx(durcheinander));
    if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
    const t = ergebnis.fahrten[0].punkte.map((p) => p.t);
    expect(t).toEqual([...t].sort((a, b) => a - b));
    expect(new Set(t).size).toBe(t.length);
    expect(t).toHaveLength(40);
  });

  it("teilt eine Datei mit zwei Ausfahrten an verschiedenen Tagen", () => {
    const samstag = linie(60);
    const sonntag = linie(60, { start: Date.UTC(2026, 6, 13, 9, 0, 0) });
    const ergebnis = gpxLesen(gpx([...samstag, ...sonntag]));
    if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
    expect(ergebnis.fahrten).toHaveLength(2);
    expect(ergebnis.fahrten[1].startMs).toBe(Date.UTC(2026, 6, 13, 9, 0, 0));
  });

  it("verwirft Teilstücke unter einem Kilometer, statt die Datei abzulehnen", () => {
    const kurz = linie(5, { meter: 50 });
    const lang = linie(60, { start: kurz[4].t + (TRENN_LUECKE_SEKUNDEN + 60) * 1000 });
    const ergebnis = gpxLesen(gpx([...kurz, ...lang]));
    if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
    expect(ergebnis.fahrten).toHaveLength(1);
    expect(ergebnis.verworfeneTeile).toBe(1);
  });

  it("dünnt lange Sekunden-Aufzeichnungen auf das Importziel aus", () => {
    const ergebnis = gpxLesen(gpx(linie(15_000, { sekunden: 1, meter: 25 })));
    if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
    const [fahrt] = ergebnis.fahrten;
    expect(fahrt.punkte.length).toBeLessThanOrEqual(IMPORT_ZIEL_PUNKTE);
    // Kennzahlen stammen aus dem vollen Track, nicht aus dem ausgedünnten.
    expect(fahrt.dauerSekunden).toBe(14_999);
  });
});

describe("anLueckenTeilen", () => {
  it("teilt an einem Sprung über 2 km (Tunnel)", () => {
    const vorher = linie(20);
    const nachher = linie(20, { start: vorher[19].t + 600_000, lat0: 46.9 });
    expect(anLueckenTeilen([...vorher, ...nachher])).toHaveLength(2);
  });

  it("lässt eine lückenlose Fahrt ganz", () => {
    expect(anLueckenTeilen(linie(100))).toHaveLength(1);
  });
});

describe("ausduennen", () => {
  it("behält ersten und letzten Punkt und bleibt unter der Grenze", () => {
    const punkte = linie(1001);
    const duenn = ausduennen(punkte, 100);
    expect(duenn.length).toBeLessThanOrEqual(100);
    expect(duenn[0]).toBe(punkte[0]);
    expect(duenn[duenn.length - 1]).toBe(punkte[1000]);
  });

  it("gibt kurze Folgen unverändert zurück", () => {
    const punkte = linie(10);
    expect(ausduennen(punkte, 100)).toBe(punkte);
  });
});
