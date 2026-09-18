import { describe, expect, it } from "vitest";
import {
  abHeute,
  besteTage,
  beurteileTag,
  heuteInZuerich,
  hoechsterPunkt,
  kombiniereTage,
  leseOpenMeteo,
  tageAufzaehlen,
  tagVorlesen,
  wochentagKurz,
  wochentagLang,
  wetterMassstab,
  type TagesVorhersage,
  type Tagesurteil,
} from "./wetterfenster";

// Ein sonniger, milder Tag — jeder Test verändert nur, was er prüft.
function tag(teil: Partial<TagesVorhersage> = {}): TagesVorhersage {
  return {
    datum: "2026-09-17",
    wetterCode: 1,
    niederschlagMm: 0,
    niederschlagProzent: 5,
    tempMaxC: 18.4,
    tempMinC: 8,
    boeenKmh: 25,
    ...teil,
  };
}

describe("beurteileTag", () => {
  it("ein trockener, milder Tag ist gut und nennt die Temperatur", () => {
    const u = beurteileTag(tag(), "motorrad");
    expect(u.stufe).toBe("gut");
    expect(u.grund).toBe("trocken");
    expect(u.text).toBe("trocken, 18°");
    expect(u.tempMaxC).toBe(18);
  });

  it("die Trocken-Grenze liegt bei 0.5 mm und unter 30 %", () => {
    expect(beurteileTag(tag({ niederschlagMm: 0.5, niederschlagProzent: 29 }), "motorrad").stufe).toBe("gut");
    expect(beurteileTag(tag({ niederschlagMm: 0.6 }), "motorrad").grund).toBe("schauer");
    expect(beurteileTag(tag({ niederschlagProzent: 30 }), "motorrad").grund).toBe("schauer");
  });

  it("Schauer möglich ist ein Vorbehalt, kein Ausschluss", () => {
    const u = beurteileTag(tag({ niederschlagMm: 1, niederschlagProzent: 40 }), "motorrad");
    expect(u.stufe).toBe("moeglich");
    expect(u.text).toBe("Schauer möglich");
  });

  it("Regen braucht Menge UND Wahrscheinlichkeit — oder viel Menge", () => {
    expect(beurteileTag(tag({ niederschlagMm: 2, niederschlagProzent: 50 }), "motorrad").grund).toBe("regen");
    expect(beurteileTag(tag({ niederschlagMm: 3, niederschlagProzent: 35 }), "motorrad").grund).toBe("schauer");
    expect(beurteileTag(tag({ niederschlagMm: 5, niederschlagProzent: 35 }), "motorrad").grund).toBe("regen");
  });

  it("Regen ist auf dem Motorrad schlecht, im Auto nur ein Vorbehalt", () => {
    const regen = tag({ wetterCode: 63, niederschlagMm: 8, niederschlagProzent: 90 });
    expect(beurteileTag(regen, "motorrad").stufe).toBe("schlecht");
    expect(beurteileTag(regen, "auto").stufe).toBe("moeglich");
  });

  it("Schnee ist für beide schlecht", () => {
    const schnee = tag({ wetterCode: 73, niederschlagMm: 4, niederschlagProzent: 80, tempMaxC: 1, tempMinC: -3 });
    expect(beurteileTag(schnee, "auto").stufe).toBe("schlecht");
    expect(beurteileTag(schnee, "motorrad").text).toBe("Schnee");
  });

  it("Gewitter ist erst mit hoher Wahrscheinlichkeit ein Grund, nicht zu fahren", () => {
    expect(beurteileTag(tag({ wetterCode: 95, niederschlagMm: 3, niederschlagProzent: 40 }), "motorrad").text).toBe(
      "Gewitter möglich",
    );
    expect(beurteileTag(tag({ wetterCode: 95, niederschlagMm: 3, niederschlagProzent: 70 }), "motorrad").stufe).toBe(
      "schlecht",
    );
    expect(beurteileTag(tag({ wetterCode: 95, niederschlagMm: 3, niederschlagProzent: 70 }), "auto").stufe).toBe(
      "moeglich",
    );
  });

  it("Frost in der Nacht warnt vor Glätte, Dauerfrost schliesst aus", () => {
    expect(beurteileTag(tag({ tempMinC: -1, tempMaxC: 12 }), "auto").text).toBe("Glätte möglich");
    const dauerfrost = beurteileTag(tag({ tempMinC: -5, tempMaxC: 2 }), "auto");
    expect(dauerfrost.stufe).toBe("schlecht");
    expect(dauerfrost.text).toBe("Glätte");
  });

  it("Kälte zählt nur auf dem Motorrad", () => {
    const kalt = tag({ tempMaxC: 5.2, tempMinC: 2 });
    expect(beurteileTag(kalt, "motorrad").text).toBe("kalt, 5°");
    expect(beurteileTag(kalt, "auto").stufe).toBe("gut");
    expect(beurteileTag(tag({ tempMaxC: 7 }), "motorrad").stufe).toBe("gut");
  });

  it("Böen: ab 60 km/h Vorbehalt fürs Motorrad, ab 80 für beide", () => {
    expect(beurteileTag(tag({ boeenKmh: 59 }), "motorrad").stufe).toBe("gut");
    expect(beurteileTag(tag({ boeenKmh: 60 }), "motorrad").text).toBe("starke Böen");
    expect(beurteileTag(tag({ boeenKmh: 70 }), "auto").stufe).toBe("gut");
    expect(beurteileTag(tag({ boeenKmh: 80 }), "motorrad").stufe).toBe("schlecht");
    expect(beurteileTag(tag({ boeenKmh: 80 }), "auto").text).toBe("Sturmböen");
  });

  it("mehrere Befunde: die schlechtere Stufe gewinnt, bei Gleichstand der gewichtigere Grund", () => {
    // Schauer (moeglich) + Sturm (schlecht) → Sturm
    expect(beurteileTag(tag({ niederschlagMm: 1, niederschlagProzent: 40, boeenKmh: 90 }), "motorrad").grund).toBe("boeen");
    // Schauer + kalt, beide moeglich → Schauer wiegt schwerer
    expect(beurteileTag(tag({ niederschlagMm: 1, niederschlagProzent: 40, tempMaxC: 5 }), "motorrad").grund).toBe("schauer");
  });

  it("fehlende Einzelwerte werden ignoriert, statt zu einem Urteil zu führen", () => {
    const u = beurteileTag(
      tag({ niederschlagProzent: null, tempMaxC: null, tempMinC: null, boeenKmh: null }),
      "motorrad",
    );
    expect(u.stufe).toBe("gut");
    expect(u.text).toBe("trocken");
  });

  it("ohne Menge entscheidet der Wettercode — Regen-Code ist nie trocken", () => {
    expect(beurteileTag(tag({ niederschlagMm: null, niederschlagProzent: null, wetterCode: 63 }), "motorrad").stufe).toBe(
      "moeglich",
    );
    expect(beurteileTag(tag({ niederschlagMm: null, niederschlagProzent: null, wetterCode: 2 }), "motorrad").stufe).toBe(
      "gut",
    );
  });

  it("ohne Menge und Code gibt es kein Urteil statt eines erfundenen", () => {
    const u = beurteileTag(tag({ niederschlagMm: null, wetterCode: null }), "motorrad");
    expect(u.stufe).toBeNull();
    expect(u.grund).toBe("unbekannt");
  });
});

function urteil(datum: string, teil: Partial<Tagesurteil> = {}): Tagesurteil {
  return {
    datum,
    stufe: "gut",
    grund: "trocken",
    text: "trocken, 18°",
    tempMaxC: 18,
    vomHoechstenPunkt: false,
    niederschlagProzent: 5,
    ...teil,
  };
}

describe("kombiniereTage", () => {
  it("ohne höchsten Punkt bleibt der Start unverändert", () => {
    const start = [urteil("2026-09-17")];
    expect(kombiniereTage(start, null, null)).toBe(start);
  });

  it("ist es oben schlechter, zählt oben — mit der Höhe im Text und der Temperatur vom Start", () => {
    const [u] = kombiniereTage(
      [urteil("2026-09-17")],
      [urteil("2026-09-17", { stufe: "schlecht", grund: "schnee", text: "Schnee", tempMaxC: 1 })],
      2106,
    );
    expect(u.stufe).toBe("schlecht");
    expect(u.text).toBe("Schnee auf 2106 m");
    expect(u.vomHoechstenPunkt).toBe(true);
    expect(u.tempMaxC).toBe(18);
  });

  it("ist es oben gleich gut oder besser, bleibt der Start", () => {
    const start = urteil("2026-09-17", { stufe: "moeglich", grund: "schauer", text: "Schauer möglich" });
    const [u] = kombiniereTage([start], [urteil("2026-09-17", { stufe: "gut" })], 2106);
    expect(u).toBe(start);
  });

  it("gleiche Stufe, gewichtigerer Grund oben: oben gewinnt", () => {
    const [u] = kombiniereTage(
      [urteil("2026-09-17", { stufe: "moeglich", grund: "kalt", text: "kalt, 6°" })],
      [urteil("2026-09-17", { stufe: "moeglich", grund: "glaette", text: "Glätte möglich" })],
      1948,
    );
    expect(u.text).toBe("Glätte möglich auf 1948 m");
  });

  it("fehlt oben ein Tag, bleibt der Start", () => {
    const start = urteil("2026-09-18");
    expect(kombiniereTage([start], [urteil("2026-09-17", { stufe: "schlecht" })], 2000)[0]).toBe(start);
  });
});

describe("besteTage", () => {
  it("empfiehlt nur gute Tage, chronologisch", () => {
    const tage = [
      urteil("2026-09-17", { stufe: "moeglich" }),
      urteil("2026-09-18", { niederschlagProzent: 10 }),
      urteil("2026-09-19", { niederschlagProzent: 0 }),
      urteil("2026-09-20", { stufe: "schlecht" }),
    ];
    expect(besteTage(tage).map((t) => t.datum)).toEqual(["2026-09-18", "2026-09-19"]);
  });

  it("wählt bei mehr guten Tagen die trockensten, dann die wärmeren (bis 25°)", () => {
    const tage = [
      urteil("2026-09-17", { niederschlagProzent: 10 }),
      urteil("2026-09-18", { niederschlagProzent: 0, tempMaxC: 14 }),
      urteil("2026-09-19", { niederschlagProzent: 0, tempMaxC: 22 }),
      urteil("2026-09-20", { niederschlagProzent: 0, tempMaxC: 31 }),
    ];
    // 31° zählt wie 25° und schlägt 22°; 14° fällt heraus.
    expect(besteTage(tage).map((t) => t.datum)).toEqual(["2026-09-19", "2026-09-20"]);
  });

  it("bei vollem Gleichstand gewinnt der frühere Tag", () => {
    const tage = [urteil("2026-09-19"), urteil("2026-09-18"), urteil("2026-09-17")];
    expect(besteTage(tage, 1).map((t) => t.datum)).toEqual(["2026-09-17"]);
  });

  it("eine schlechte Woche ergibt eine leere Liste, keinen Notnagel", () => {
    expect(besteTage([urteil("2026-09-17", { stufe: "moeglich" }), urteil("2026-09-18", { stufe: null })])).toEqual([]);
    expect(besteTage([])).toEqual([]);
  });
});

describe("leseOpenMeteo", () => {
  const antwort = {
    daily: {
      time: ["2026-09-17", "2026-09-18"],
      weather_code: [3, 61],
      temperature_2m_max: [19.2, 14],
      temperature_2m_min: [9, 8],
      precipitation_sum: [0, 6.3],
      precipitation_probability_max: [10, null],
      wind_gusts_10m_max: [30, 45],
    },
  };

  it("liest ein einzelnes Objekt als einen Ort", () => {
    const [ort] = leseOpenMeteo(antwort);
    expect(ort).toHaveLength(2);
    expect(ort[1]).toEqual({
      datum: "2026-09-18",
      wetterCode: 61,
      niederschlagMm: 6.3,
      niederschlagProzent: null,
      tempMaxC: 14,
      tempMinC: 8,
      boeenKmh: 45,
    });
  });

  it("liest ein Array als mehrere Orte in Abfragereihenfolge", () => {
    expect(leseOpenMeteo([antwort, { daily: { time: ["2026-09-17"] } }]).map((o) => o.length)).toEqual([2, 1]);
  });

  it("fehlende Felder werden null, kaputte Antworten eine leere Liste", () => {
    const [ort] = leseOpenMeteo({ daily: { time: ["2026-09-17"] } });
    expect(ort[0].tempMaxC).toBeNull();
    expect(leseOpenMeteo(null)).toEqual([[]]);
    expect(leseOpenMeteo({ error: true, reason: "x" })).toEqual([[]]);
    expect(leseOpenMeteo({ daily: { time: ["kein datum", 5] } })).toEqual([[]]);
  });
});

describe("Datum", () => {
  it("abHeute wirft vergangene Tage weg", () => {
    expect(abHeute([{ datum: "2026-09-16" }, { datum: "2026-09-17" }], "2026-09-17")).toEqual([{ datum: "2026-09-17" }]);
  });

  it("heuteInZuerich rechnet in Schweizer Zeit, nicht in UTC", () => {
    // 23:30 UTC am 16. ist in Zürich (Sommerzeit, UTC+2) bereits der 17.
    expect(heuteInZuerich(new Date("2026-09-16T23:30:00Z"))).toBe("2026-09-17");
  });

  it("Wochentage ohne Zeitzonenverschiebung", () => {
    expect(wochentagKurz("2026-09-17")).toBe("Do");
    expect(wochentagLang("2026-09-20")).toBe("Sonntag");
  });

  it("tageAufzaehlen", () => {
    const heute = "2026-09-17";
    expect(tageAufzaehlen([urteil("2026-09-19")], heute)).toBe("Samstag");
    expect(tageAufzaehlen([urteil("2026-09-17"), urteil("2026-09-19"), urteil("2026-09-20")], heute)).toBe(
      "heute, Samstag und Sonntag",
    );
    expect(tageAufzaehlen([urteil("2026-09-19"), urteil("2026-09-20")], heute, true)).toBe("Sa, So");
  });
});

describe("tagVorlesen", () => {
  it("sagt Stufe und Grund in Worten, nicht nur über die Farbe", () => {
    expect(tagVorlesen(urteil("2026-09-19"), false)).toBe("Samstag: gut, trocken, 18°");
    expect(
      tagVorlesen(urteil("2026-09-17", { stufe: "schlecht", grund: "regen", text: "Regen", tempMaxC: 12 }), true),
    ).toBe("Heute: schlecht, Regen, bis 12°");
    expect(tagVorlesen(urteil("2026-09-17", { stufe: null, text: "keine Daten" }), true)).toBe("Heute: keine Daten");
  });
});

describe("hoechsterPunkt", () => {
  // Rund 1.1 km pro 0.01° Breite.
  const linie: [number, number][] = [
    [8.8, 46.8],
    [8.8, 46.81],
    [8.8, 46.82],
    [8.8, 46.83],
  ];

  it("findet die Koordinate beim Kilometer des Gipfels", () => {
    const p = hoechsterPunkt(linie, [
      { km: 0, m: 1000 },
      { km: 2, m: 1900 },
      { km: 3.3, m: 1500 },
    ]);
    expect(p).toEqual({ koordinate: [8.8, 46.82], hoeheM: 1900, startM: 1000 });
  });

  it("lohnt sich unter 300 m Höhenunterschied nicht", () => {
    expect(hoechsterPunkt(linie, [{ km: 0, m: 1000 }, { km: 2, m: 1299 }])).toBeNull();
  });

  it("ohne Profil oder Geometrie kein Punkt", () => {
    expect(hoechsterPunkt(linie, null)).toBeNull();
    expect(hoechsterPunkt([[8.8, 46.8]], [{ km: 0, m: 0 }, { km: 1, m: 900 }])).toBeNull();
  });

  it("liegt der Gipfel hinter dem Ende der Geometrie, gilt der letzte Punkt", () => {
    expect(hoechsterPunkt(linie, [{ km: 0, m: 500 }, { km: 99, m: 2000 }])?.koordinate).toEqual([8.8, 46.83]);
  });
});

describe("wetterMassstab", () => {
  it("nur Autos → auto, sonst der strengere Motorrad-Massstab", () => {
    expect(wetterMassstab(["auto", "auto"])).toBe("auto");
    expect(wetterMassstab(["auto", "motorrad"])).toBe("motorrad");
    expect(wetterMassstab([])).toBe("motorrad");
  });
});
