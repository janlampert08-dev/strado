import { describe, expect, it } from "vitest";
import {
  baueVerkehrseinschaetzung,
  faktorText,
  jetztInZuerich,
  prognoseFuerStunde,
  stufeFuerLive,
} from "@/lib/verkehrslage";


// Eine Woche mit Spannweite 1.05–1.30 (10./90. Perzentil), wie sie
// skalaFuerPunkte für einen Pass liefert.
const SKALA = { unten: 1.05, oben: 1.3, flach: false };

describe("stufeFuerLive", () => {
  it("legt Live auf die Prognosestufen", () => {
    expect(stufeFuerLive("low")).toBe("ruhig");
    expect(stufeFuerLive("moderate")).toBe("normal");
    expect(stufeFuerLive("heavy")).toBe("dicht");
    expect(stufeFuerLive("severe")).toBe("zaeh");
  });
});

describe("jetztInZuerich", () => {
  it("rechnet in Schweizer Ortszeit (2026-09-21 ist ein Montag)", () => {
    // 12:00 UTC = 14:00 MESZ in Zürich.
    expect(jetztInZuerich(new Date("2026-09-21T12:00:00Z"))).toEqual({ wochentag: 1, stunde: 14 });
  });

  it("nimmt den Vortag bei UTC-Mitternacht im Winter", () => {
    // 2026-01-05T00:30Z = 01:30 MEZ, ebenfalls Montag.
    expect(jetztInZuerich(new Date("2026-01-05T00:30:00Z"))).toEqual({ wochentag: 1, stunde: 1 });
  });
});

describe("prognoseFuerStunde", () => {
  const punkte = [
    { wochentag: 7, stunde: 10, faktor: 1.2 },
    { wochentag: 7, stunde: 11, faktor: 1.35 },
  ];

  it("findet die exakte Stunde", () => {
    expect(prognoseFuerStunde(punkte, 7, 10)).toBe(1.2);
  });

  it("erfindet keine Stunde dazu", () => {
    expect(prognoseFuerStunde(punkte, 7, 22)).toBeNull();
    expect(prognoseFuerStunde(punkte, 1, 10)).toBeNull();
    expect(prognoseFuerStunde([], 7, 10)).toBeNull();
  });
});

describe("faktorText", () => {
  it("nennt die ruhigste Stunde beim Faktor 1", () => {
    expect(faktorText(1)).toBe("entspricht der ruhigsten Stunde der Woche");
  });

  it("nennt den Aufschlag in Prozent", () => {
    expect(faktorText(1.2)).toBe("ca. +20 % Fahrzeit gegenüber der ruhigsten Stunde der Woche");
  });
});

describe("baueVerkehrseinschaetzung", () => {
  it("Live mit Prognose als Einordnung", () => {
    const e = baueVerkehrseinschaetzung({
      live: "moderate",
      prognoseFaktor: 1.03,
      skala: SKALA,
      hatPrognose: true,
      hatGemeinschaft: false,
      liveLaedt: false,
    });
    expect(e.titel).toBe("Verkehr gerade: Mässig");
    expect(e.detail).toContain("Üblicherweise ruhig um diese Zeit");
    expect(e.quellen).toEqual(["Live: Mapbox", "Vorhersage: Mapbox"]);
  });

  it("Live ohne Prognose steht allein", () => {
    const e = baueVerkehrseinschaetzung({
      live: "severe",
      prognoseFaktor: null,
      skala: SKALA,
      hatPrognose: false,
      hatGemeinschaft: false,
      liveLaedt: false,
    });
    expect(e.titel).toBe("Verkehr gerade: Stau");
    expect(e.detail).toBeNull();
    expect(e.quellen).toEqual(["Live: Mapbox"]);
  });

  it("Prognose ohne Live sagt, dass der Live-Wert fehlt", () => {
    const e = baueVerkehrseinschaetzung({
      live: null,
      prognoseFaktor: 1.35,
      skala: SKALA,
      hatPrognose: true,
      hatGemeinschaft: false,
      liveLaedt: false,
    });
    expect(e.titel).toBe("Um diese Zeit typischerweise voll");
    expect(e.detail).toContain("Kein Live-Wert für diese Stelle.");
    expect(e.quellen).toEqual(["Vorhersage: Mapbox"]);
  });

  it("laufende Live-Abfrage ist kein Beleg für fehlende Daten", () => {
    const e = baueVerkehrseinschaetzung({
      live: null,
      prognoseFaktor: null,
      skala: SKALA,
      hatPrognose: false,
      hatGemeinschaft: false,
      liveLaedt: true,
    });
    expect(e.titel).toBe("Live-Verkehr wird geladen…");
  });

  it("Profil ausserhalb der Stunde benennt die Abdeckung", () => {
    const e = baueVerkehrseinschaetzung({
      live: null,
      prognoseFaktor: null,
      skala: SKALA,
      hatPrognose: true,
      hatGemeinschaft: false,
      liveLaedt: false,
    });
    expect(e.titel).toBe("Ausserhalb der Vorhersagezeit");
    expect(e.detail).toContain("6–19 Uhr");
  });

  it("Gemeinschaft trägt den Hinweis, nicht die Zahl", () => {
    const e = baueVerkehrseinschaetzung({
      live: null,
      prognoseFaktor: null,
      skala: SKALA,
      hatPrognose: false,
      hatGemeinschaft: true,
      liveLaedt: false,
    });
    expect(e.titel).toBe("Keine Live-Daten für diese Strecke");
  });

  it("ohne alles bleibt ehrlich nichts übrig", () => {
    const e = baueVerkehrseinschaetzung({
      live: null,
      prognoseFaktor: null,
      skala: SKALA,
      hatPrognose: false,
      hatGemeinschaft: false,
      liveLaedt: false,
    });
    expect(e.titel).toBe("Noch keine Verkehrsdaten");
    expect(e.quellen).toEqual([]);
  });
});

describe("baueVerkehrseinschaetzung — Stufe relativ zur Strecke", () => {
  it("liest denselben Faktor an einer ruhigen und einer vollen Strecke verschieden", () => {
    const eingabe = {
      live: null,
      prognoseFaktor: 1.14,
      hatPrognose: true,
      hatGemeinschaft: false,
      liveLaedt: false,
    } as const;
    // Am Furka ist 1.14 die ruhigste Werktagsstunde …
    expect(
      baueVerkehrseinschaetzung({ ...eingabe, skala: { unten: 1.14, oben: 1.3, flach: false } }).titel,
    ).toBe("Um diese Zeit typischerweise ruhig");
    // … an einer Strecke, die nie über 1.15 kommt, fast die vollste.
    expect(
      baueVerkehrseinschaetzung({ ...eingabe, skala: { unten: 1.02, oben: 1.15, flach: false } }).titel,
    ).toBe("Um diese Zeit typischerweise voll");
  });

  it("nennt eine flache Woche ruhig", () => {
    const e = baueVerkehrseinschaetzung({
      live: null,
      prognoseFaktor: 1.06,
      skala: { unten: 1.0, oben: 1.05, flach: true },
      hatPrognose: true,
      hatGemeinschaft: false,
      liveLaedt: false,
    });
    expect(e.titel).toBe("Um diese Zeit typischerweise ruhig");
  });
});
