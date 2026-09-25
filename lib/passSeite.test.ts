import { describe, expect, it } from "vitest";
import {
  amPass,
  imKanton,
  istPassId,
  kantoneText,
  mitArtikel,
  naechstePaesse,
  passBeschreibung,
  passFragen,
  punktAusEwkb,
  ueberPass,
} from "@/lib/passSeite";
import type { PassStatusAnzeige } from "@/lib/passStatus";

describe("punktAusEwkb", () => {
  it("liest den Scheitel so, wie PostgREST ihn ausliefert", () => {
    // Beide Werte live aus paesse.scheitel gelesen (2026-09-25), daneben
    // st_asgeojson desselben Punkts: susten [8.44652, 46.72912].
    expect(punktAusEwkb("0101000020E61000001405FA449EE42040056EDDCD535D4740")).toEqual([
      8.44652, 46.72912,
    ]);
    const klausen = punktAusEwkb("0101000020E610000067614F3BFCB521406C5B94D9206F4740");
    expect(klausen?.[0]).toBeCloseTo(8.85544, 5);
    expect(klausen?.[1]).toBeCloseTo(46.86819, 5);
  });

  it("liest auch WKB ohne SRID und Big-Endian", () => {
    const puffer = new DataView(new ArrayBuffer(21));
    puffer.setUint8(0, 0);
    puffer.setUint32(1, 1, false);
    puffer.setFloat64(5, 7.5, false);
    puffer.setFloat64(13, 46.25, false);
    const hex = [...new Uint8Array(puffer.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(punktAusEwkb(hex)).toEqual([7.5, 46.25]);
  });

  it("gibt null für alles, was kein 2D-Punkt ist", () => {
    expect(punktAusEwkb(null)).toBeNull();
    expect(punktAusEwkb({ type: "Point" })).toBeNull();
    expect(punktAusEwkb("xyz")).toBeNull();
    expect(punktAusEwkb("0101")).toBeNull();
    // LineString (Typ 2)
    expect(punktAusEwkb("0102000020E61000001405FA449EE42040056EDDCD535D4740")).toBeNull();
  });
});

describe("istPassId", () => {
  it("nimmt Katalogschlüssel und lehnt alles andere ab", () => {
    expect(istPassId("susten")).toBe(true);
    expect(istPassId("grosser-st-bernhard")).toBe(true);
    expect(istPassId("Susten")).toBe(false);
    expect(istPassId("../susten")).toBe(false);
    expect(istPassId("a".repeat(61))).toBe(false);
    expect(istPassId(undefined)).toBe(false);
  });
});

describe("Kantone und Artikel", () => {
  it("schreibt die Kantone aus", () => {
    expect(kantoneText(["GR"])).toBe("Kanton Graubünden");
    expect(kantoneText(["UR", "GL"])).toBe("Kantone Uri und Glarus");
    expect(kantoneText(["BE", "VS", "UR"])).toBe("Kantone Bern, Wallis und Uri");
    expect(imKanton(["GR"])).toBe("im Kanton Graubünden");
    expect(imKanton(["UR", "GL"])).toBe("in den Kantonen Uri und Glarus");
  });

  it("kennt die weiblichen Pässe", () => {
    expect(mitArtikel("susten", "Sustenpass")).toBe("der Sustenpass");
    expect(mitArtikel("ibergeregg", "Ibergeregg")).toBe("die Ibergeregg");
    expect(amPass("furka", "Furkapass")).toBe("am Furkapass");
    expect(amPass("sattelegg", "Sattelegg")).toBe("an der Sattelegg");
    expect(ueberPass("col-de-la-croix", "Col de la Croix")).toBe("über den Col de la Croix");
  });
});

describe("naechstePaesse", () => {
  const alle = [
    { id: "susten", kantone: ["BE", "UR"], scheitel: [8.44652, 46.72912] as [number, number] },
    { id: "grimsel", kantone: ["BE", "VS"], scheitel: [8.3377, 46.56152] as [number, number] },
    { id: "furka", kantone: ["UR", "VS"], scheitel: [8.41518, 46.57269] as [number, number] },
    { id: "klausen", kantone: ["UR", "GL"], scheitel: [8.85544, 46.86819] as [number, number] },
    { id: "kaputt", kantone: ["UR"], scheitel: null },
  ];

  it("sortiert nach Luftlinie und lässt den Pass selbst weg", () => {
    const ergebnis = naechstePaesse(alle[0], alle, 3);
    expect(ergebnis.map((e) => e.pass.id)).toEqual(["furka", "grimsel", "klausen"]);
    expect(ergebnis[0].distanzKm).toBeGreaterThan(15);
    expect(ergebnis[0].distanzKm).toBeLessThan(20);
  });

  it("fällt ohne eigenen Scheitel auf den gemeinsamen Kanton zurück", () => {
    const ergebnis = naechstePaesse(alle[4], alle, 4);
    expect(ergebnis.map((e) => e.pass.id)).toEqual(["susten", "furka", "klausen"]);
    expect(ergebnis.every((e) => e.distanzKm === null)).toBe(true);
  });
});

const susten = {
  id: "susten",
  name: "Sustenpass",
  hoeheM: 2224,
  kantone: ["BE", "UR"],
  wintersperreAbMonat: 10,
  wintersperreBisMonat: 5,
};

const offen: PassStatusAnzeige = {
  zustand: "offen",
  label: "Offen",
  ton: "gut",
  text: "Keine Sperrung gemeldet.",
  herkunft: "ASTRA-Verkehrsmeldungen · vor 4 Minuten",
};

describe("passBeschreibung", () => {
  it("nennt Höhe, Kantone und Wintersperre, aber keinen Status", () => {
    const text = passBeschreibung(susten);
    // Das Tausendertrennzeichen hängt an der ICU-Fassung von Node (’ oder ').
    expect(text).toContain(`Der Sustenpass liegt auf ${(2224).toLocaleString("de-CH")} m ü. M. (Kantone Bern und Uri).`);
    expect(text).toContain("Wintersperre üblich von Oktober bis Mai.");
    expect(text).not.toMatch(/\bOffen\b|gesperrt\b/);
  });

  it("sagt es, wenn es keine übliche Wintersperre gibt", () => {
    expect(
      passBeschreibung({ ...susten, id: "julier", name: "Julierpass", wintersperreAbMonat: null, wintersperreBisMonat: null }),
    ).toContain("Ohne übliche Wintersperre.");
  });
});

describe("passFragen", () => {
  it("beantwortet den Status mit Quelle und Alter", () => {
    const fragen = passFragen({ pass: susten, anzeige: offen, strecke: null });
    expect(fragen[0].frage).toBe("Ist der Sustenpass offen?");
    expect(fragen[0].antwort).toContain("Offen");
    expect(fragen[0].antwort).toContain("ASTRA-Verkehrsmeldungen · vor 4 Minuten");
    expect(fragen[1].frage).toBe("Wann ist die Wintersperre am Sustenpass?");
    expect(fragen[1].antwort).toContain("Oktober bis Mai");
    expect(fragen[2].antwort).toContain("in den Kantonen Bern und Uri");
    expect(fragen).toHaveLength(3);
  });

  it("macht aus 'kein Stand' kein 'offen'", () => {
    const unbekannt: PassStatusAnzeige = {
      zustand: "unbekannt",
      label: "Kein Stand",
      ton: "still",
      text: "Zurzeit keine verlässliche Meldung.",
      herkunft: "Noch kein Abgleich",
    };
    const [status] = passFragen({ pass: susten, anzeige: unbekannt, strecke: null });
    expect(status.antwort).toContain("keine verlässliche Meldung");
    expect(status.antwort).not.toContain("Offen");
  });

  it("nennt die Strecke, wenn es eine gibt", () => {
    const fragen = passFragen({ pass: susten, anzeige: offen, strecke: { name: "Sustenpass", laengeKm: 45.64 } });
    expect(fragen[3].frage).toBe("Welche Strecke führt über den Sustenpass?");
    expect(fragen[3].antwort).toContain(`${(45.6).toLocaleString("de-CH")} km`);
  });
});
