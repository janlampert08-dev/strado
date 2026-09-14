import { describe, expect, it } from "vitest";
import {
  fahrtenProFahrzeug,
  fahrtenProJahr,
  fahrtenProMonat,
  jahrAus,
  monatAus,
  type FahrtFuerStatistik,
} from "./fahrtstatistik";

function fahrt(
  datum: string,
  km: number | null = 10,
  hm: number | null = 100,
  fahrzeug: string | null = "auto-1",
): FahrtFuerStatistik {
  return { datum, distanz_km: km, hoehenmeter_aufstieg: hm, fahrzeug_id: fahrzeug };
}

describe("jahrAus / monatAus", () => {
  it("zerlegt ein DATE ohne Zeitzonenumweg", () => {
    expect(jahrAus("2026-01-01")).toBe(2026);
    expect(monatAus("2026-01-01")).toBe(1);
    expect(monatAus("2026-12-31")).toBe(12);
  });

  // Der eigentliche Grund für die Zeichenketten-Zerlegung: new Date() würde
  // "2026-01-01" als UTC-Mitternacht lesen und in jeder westlichen Zone das
  // Vorjahr liefern. Dieser Test hält fest, dass wir das NICHT tun.
  it("ordnet den 1. Januar dem laufenden Jahr zu, nicht dem Vorjahr", () => {
    const zeilen = fahrtenProJahr([fahrt("2026-01-01")]);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].jahr).toBe(2026);
  });

  it("weist unbrauchbare Datumsangaben ab, statt sie zu raten", () => {
    expect(jahrAus("2026-1-1")).toBeNull();
    expect(jahrAus("")).toBeNull();
    expect(jahrAus("gestern")).toBeNull();
    expect(monatAus("2026-13-01")).toBeNull();
    expect(monatAus("2026-00-01")).toBeNull();
  });
});

describe("fahrtenProJahr", () => {
  it("fasst je Jahr zusammen und sortiert neuestes zuerst", () => {
    const zeilen = fahrtenProJahr([
      fahrt("2024-05-01", 20, 200),
      fahrt("2026-06-01", 30, 300),
      fahrt("2026-07-01", 12, 150),
    ]);

    expect(zeilen.map((z) => z.jahr)).toEqual([2026, 2024]);
    expect(zeilen[0]).toMatchObject({ jahr: 2026, fahrten: 2, km: 42, hoehenmeter: 450 });
    expect(zeilen[1]).toMatchObject({ jahr: 2024, fahrten: 1, km: 20, hoehenmeter: 200 });
  });

  it("rundet Kilometer auf eine Stelle statt Gleitkommarauschen zu zeigen", () => {
    const zeilen = fahrtenProJahr([
      fahrt("2026-01-02", 0.1, 0),
      fahrt("2026-01-03", 0.2, 0),
    ]);
    expect(zeilen[0].km).toBe(0.3);
  });

  it("zählt fehlende Messwerte als null und nicht als NaN", () => {
    const zeilen = fahrtenProJahr([fahrt("2026-01-02", null, null)]);
    expect(zeilen[0]).toMatchObject({ fahrten: 1, km: 0, hoehenmeter: 0 });
  });

  it("vergleicht mit dem Vorjahr, wenn es eines gibt", () => {
    const zeilen = fahrtenProJahr([
      fahrt("2025-05-01", 100, 0),
      fahrt("2026-05-01", 130, 0),
    ]);
    expect(zeilen[0]).toMatchObject({ jahr: 2026, kmGegenVorjahr: 30 });
    // Das älteste Jahr hat keinen Vergleich — nicht null Kilometer, sondern
    // gar keine Aussage.
    expect(zeilen[1].kmGegenVorjahr).toBeNull();
  });

  it("lässt den Vergleich weg, wenn das Vorjahr eine Lücke ist", () => {
    const zeilen = fahrtenProJahr([
      fahrt("2023-05-01", 100, 0),
      fahrt("2026-05-01", 130, 0),
    ]);
    expect(zeilen.map((z) => z.jahr)).toEqual([2026, 2023]);
    // 2025 enthält keine Fahrt. Ein Vergleich gegen "0 km" wäre ein
    // erfundener Rückgang.
    expect(zeilen[0].kmGegenVorjahr).toBeNull();
  });

  it("zeigt einen Rückgang als negative Zahl", () => {
    const zeilen = fahrtenProJahr([
      fahrt("2025-05-01", 200, 0),
      fahrt("2026-05-01", 50, 0),
    ]);
    expect(zeilen[0].kmGegenVorjahr).toBe(-150);
  });

  it("erfindet keine Nullzeilen für Jahre ohne Fahrt", () => {
    const zeilen = fahrtenProJahr([fahrt("2020-05-01"), fahrt("2026-05-01")]);
    expect(zeilen).toHaveLength(2);
  });

  it("liefert eine leere Liste für eine leere Eingabe", () => {
    expect(fahrtenProJahr([])).toEqual([]);
  });
});

describe("fahrtenProFahrzeug", () => {
  it("sortiert nach Kilometern absteigend", () => {
    const zeilen = fahrtenProFahrzeug([
      fahrt("2026-05-01", 10, 0, "toeff"),
      fahrt("2026-05-02", 90, 0, "auto"),
    ]);
    expect(zeilen.map((z) => z.fahrzeugId)).toEqual(["auto", "toeff"]);
  });

  it("hält Fahrten ohne Fahrzeug als eigene Zeile am Ende", () => {
    const zeilen = fahrtenProFahrzeug([
      fahrt("2026-05-01", 500, 0, null),
      fahrt("2026-05-02", 10, 0, "auto"),
    ]);
    // Trotz der grösseren Kilometerzahl steht die Zeile ohne Zuordnung
    // hinten — sie ist ein Sammelposten, kein Fahrzeug.
    expect(zeilen.map((z) => z.fahrzeugId)).toEqual(["auto", null]);
  });

  it("summiert sich auf dieselbe Gesamtzahl wie die Jahresansicht", () => {
    const eingabe = [
      fahrt("2025-05-01", 12.5, 120, "auto"),
      fahrt("2026-05-02", 7.5, 80, null),
      fahrt("2026-05-03", 30, 200, "toeff"),
    ];
    const proFahrzeug = fahrtenProFahrzeug(eingabe);
    const jahre = fahrtenProJahr(eingabe);

    const kmFahrzeug = proFahrzeug.reduce((s, z) => s + z.km, 0);
    const kmJahre = jahre.reduce((s, z) => s + z.km, 0);
    expect(Math.round(kmFahrzeug * 10) / 10).toBe(Math.round(kmJahre * 10) / 10);

    const fahrtenFahrzeug = proFahrzeug.reduce((s, z) => s + z.fahrten, 0);
    expect(fahrtenFahrzeug).toBe(eingabe.length);
  });

  it("liefert eine leere Liste für eine leere Eingabe", () => {
    expect(fahrtenProFahrzeug([])).toEqual([]);
  });
});

describe("fahrtenProMonat", () => {
  it("liefert zwölf Werte, Index 0 ist Januar", () => {
    const monate = fahrtenProMonat([fahrt("2026-01-15"), fahrt("2026-12-24")], 2026);
    expect(monate).toHaveLength(12);
    expect(monate[0]).toBe(1);
    expect(monate[11]).toBe(1);
  });

  it("behält die Nullen — die Winterpause ist der Inhalt", () => {
    const monate = fahrtenProMonat([fahrt("2026-07-01"), fahrt("2026-07-02")], 2026);
    expect(monate).toEqual([0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
  });

  it("ignoriert Fahrten aus anderen Jahren", () => {
    const monate = fahrtenProMonat([fahrt("2025-07-01"), fahrt("2026-07-01")], 2026);
    expect(monate[6]).toBe(1);
  });

  it("ignoriert unbrauchbare Datumsangaben", () => {
    const monate = fahrtenProMonat([{ ...fahrt("2026-07-01"), datum: "kaputt" }], 2026);
    expect(monate.every((m) => m === 0)).toBe(true);
  });
});
