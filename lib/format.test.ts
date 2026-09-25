import { afterEach, describe, expect, it, vi } from "vitest";
import {
  datumCH,
  dauerTeile,
  formatDauer,
  formatDuration,
  formatKmGerundet,
  formatMeter,
  mitAnzahl,
  nomen,
  todayInZurich,
} from "@/lib/format";

describe("formatDuration", () => {
  it("formats sub-hour durations as mm:ss", () => {
    expect(formatDuration(65)).toBe("01:05");
  });

  it("formats hour-plus durations as h:mm:ss", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("pads single-digit minutes and seconds", () => {
    expect(formatDuration(5)).toBe("00:05");
  });
});

describe("formatDauer", () => {
  // Ohne Einheit las sich "15:27" neben einem Datum wie eine Uhrzeit.
  it("adds min below one hour", () => {
    expect(formatDauer(927)).toBe("15:27\u00a0min");
  });

  it("adds h from one hour on", () => {
    expect(formatDauer(3600)).toBe("1:00:00\u00a0h");
    expect(formatDauer(3912)).toBe("1:05:12\u00a0h");
  });

  it("splits value and unit for tiles", () => {
    expect(dauerTeile(59)).toEqual({ wert: "00:59", einheit: "min" });
    expect(dauerTeile(7200)).toEqual({ wert: "2:00:00", einheit: "h" });
  });
});

describe("formatMeter", () => {
  it("groups thousands the Swiss way and rounds", () => {
    expect(formatMeter(2315)).toBe(`${(2315).toLocaleString("de-CH")}\u00a0m`);
    expect(formatMeter(2315)).not.toBe("2315 m");
    expect(formatMeter(460.6)).toBe("461\u00a0m");
  });
});

describe("todayInZurich", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // CEST (UTC+2) im Sommer: 22:30 UTC ist bereits 00:30 Uhr des Folgetags
  // in Zürich — genau der Fall, den die UTC-basierte Berechnung falsch
  // stempeln würde.
  it("rolls over to the next local day for a late-night UTC instant in summer (CEST, UTC+2)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T22:30:00Z"));
    expect(todayInZurich()).toBe("2026-06-15");
  });

  // CET (UTC+1) im Winter: 23:30 UTC ist erst 00:30 Uhr des Folgetags in
  // Zürich (kleinerer Versatz als im Sommer, aber derselbe Effekt).
  it("rolls over to the next local day for a late-night UTC instant in winter (CET, UTC+1)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-14T23:30:00Z"));
    expect(todayInZurich()).toBe("2026-01-15");
  });

  it("stays on the same local day for a UTC instant well within the local day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T10:00:00Z"));
    expect(todayInZurich()).toBe("2026-06-14");
  });
});

describe("datumCH", () => {
  it("schreibt ein Datum schweizerisch: Tag.Monat.Jahr, zweistellig", () => {
    expect(datumCH(new Date("2026-09-08T12:00:00Z"))).toBe("08.09.2026");
  });

  it("bleibt bei der Schweizer Schreibweise, egal wo die Laufzeit steht", () => {
    // Der Punkt der festen Locale: käme sie aus der Umgebung, zeigte die
    // eine Seite 08.09.2026 und die andere 9/8/2026 — und Server und
    // Client könnten sich unterscheiden, was React als Hydrationsfehler
    // meldet.
    expect(datumCH(new Date("2026-01-02T12:00:00Z"))).toBe("02.01.2026");
  });
});

describe("nomen", () => {
  it("wählt die Einzahl bei genau eins", () => {
    expect(nomen(1, "Fahrt", "Fahrten")).toBe("Fahrt");
  });

  it("wählt die Mehrzahl bei null und ab zwei", () => {
    expect(nomen(0, "Fahrt", "Fahrten")).toBe("Fahrten");
    expect(nomen(2, "Fahrt", "Fahrten")).toBe("Fahrten");
  });
});

describe("mitAnzahl", () => {
  it("setzt Zahl und Nomen zusammen", () => {
    expect(mitAnzahl(1, "Strecke", "Strecken")).toBe("1 Strecke");
    expect(mitAnzahl(3, "Strecke", "Strecken")).toBe("3 Strecken");
    expect(mitAnzahl(0, "Kehre", "Kehren")).toBe("0 Kehren");
  });

  it("schreibt grosse Zahlen in Schweizer Schreibweise", () => {
    expect(mitAnzahl(1380, "Fahrt", "Fahrten")).toBe("1'380 Fahrten");
  });
});

describe("formatKmGerundet", () => {
  it("rundet die ungerundete DB-Länge auf ganze Kilometer", () => {
    expect(formatKmGerundet(24.371829)).toBe("24");
    expect(formatKmGerundet(7.5)).toBe("8");
    expect(formatKmGerundet(33.49)).toBe("33");
  });
});
