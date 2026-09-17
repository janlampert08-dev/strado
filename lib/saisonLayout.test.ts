import { describe, expect, it } from "vitest";
import {
  listeKuerzen,
  monatsBalken,
  saisonDateiname,
  saisonLayout,
  schriftFuerBreite,
  textKuerzen,
  zahlCH,
  SAISON_FORMATE,
  type SaisonFormat,
} from "./saisonLayout";

// Näherung für eine proportionale Schrift: ein Zeichen ≈ 0.55 em.
const breiteBei = (text: string) => (px: number) => Array.from(text).length * px * 0.55;

describe("saisonLayout", () => {
  const faelle: [SaisonFormat, boolean][] = [
    ["feed", true],
    ["feed", false],
    ["story", true],
    ["story", false],
  ];

  it.each(faelle)("%s (meistgefahren: %s) stapelt von oben nach unten ohne Überlappung", (format, mit) => {
    const l = saisonLayout(format, { mitMeistgefahren: mit });
    const reihe = [
      l.markeOben,
      l.markeOben + l.markeHoehe,
      l.titelBaseline,
      l.listenKopfBaseline,
      l.listeOben,
      l.listeOben + l.maxZeilen * l.zeilenHoehe,
      ...(l.meistBaseline !== null ? [l.meistBaseline] : []),
      l.monateOben,
      l.monateBasis,
      l.kennzahlenOben,
      l.fussLinie,
      l.fussBaseline,
    ];
    for (let i = 1; i < reihe.length; i++) {
      expect(reihe[i]).toBeGreaterThanOrEqual(reihe[i - 1]);
    }
    expect(l.listeOben + l.maxZeilen * l.zeilenHoehe).toBeLessThanOrEqual(l.listeUnten);
  });

  it.each(faelle)("%s hält die sicheren Ränder ein", (format, mit) => {
    const l = saisonLayout(format, { mitMeistgefahren: mit });
    const { sicherOben, sicherUnten, hoehe } = SAISON_FORMATE[format];
    expect(l.markeOben).toBeGreaterThanOrEqual(sicherOben);
    expect(l.fussBaseline).toBeLessThanOrEqual(hoehe - sicherUnten);
  });

  it("bietet im Feed mindestens vier Ortszeilen und in der Story mehr", () => {
    const feed = saisonLayout("feed", { mitMeistgefahren: true });
    const story = saisonLayout("story", { mitMeistgefahren: true });
    expect(feed.maxZeilen).toBeGreaterThanOrEqual(4);
    expect(story.maxZeilen).toBeGreaterThan(feed.maxZeilen);
  });

  it("gewinnt ohne Meistgefahren-Zeile Platz für die Liste", () => {
    expect(saisonLayout("feed", { mitMeistgefahren: false }).maxZeilen).toBeGreaterThanOrEqual(
      saisonLayout("feed", { mitMeistgefahren: true }).maxZeilen,
    );
  });
});

describe("listeKuerzen", () => {
  it("lässt eine passende Liste unverändert", () => {
    expect(listeKuerzen(["a", "b"], 3)).toEqual({ sichtbar: ["a", "b"], weitere: 0 });
    expect(listeKuerzen(["a", "b", "c"], 3)).toEqual({ sichtbar: ["a", "b", "c"], weitere: 0 });
  });

  it("macht die letzte Zeile zu '+N weitere', statt über den Rand zu laufen", () => {
    const { sichtbar, weitere } = listeKuerzen(["a", "b", "c", "d", "e"], 3);
    expect(sichtbar).toEqual(["a", "b"]);
    expect(weitere).toBe(3);
    // Zeilen insgesamt: sichtbare plus die Hinweiszeile.
    expect(sichtbar.length + 1).toBe(3);
  });

  it("nennt nie '+1 weitere'", () => {
    for (let n = 1; n < 20; n++) {
      for (let max = 1; max < 10; max++) {
        expect(listeKuerzen(Array.from({ length: n }, (_, i) => i), max).weitere).not.toBe(1);
      }
    }
  });

  it("kommt mit null Zeilen und einer leeren Liste zurecht", () => {
    expect(listeKuerzen(["a"], 0)).toEqual({ sichtbar: [], weitere: 1 });
    expect(listeKuerzen([], 4)).toEqual({ sichtbar: [], weitere: 0 });
  });
});

describe("schriftFuerBreite", () => {
  it("behält die Startgrösse, wenn der Text passt", () => {
    expect(schriftFuerBreite(breiteBei("Klausen"), 800, 44, 30)).toBe(44);
  });

  it("verkleinert, bis der Text passt", () => {
    const px = schriftFuerBreite(breiteBei("Grand-Saint-Bernard"), 400, 44, 30);
    expect(px).toBeLessThan(44);
    expect(breiteBei("Grand-Saint-Bernard")(px)).toBeLessThanOrEqual(400);
  });

  it("geht nie unter das Minimum", () => {
    expect(schriftFuerBreite(breiteBei("x".repeat(200)), 100, 44, 30)).toBe(30);
  });
});

describe("textKuerzen", () => {
  const messen = (t: string) => Array.from(t).length * 20;

  it("lässt einen passenden Text stehen", () => {
    expect(textKuerzen("Klausenpass", messen, 400)).toBe("Klausenpass");
  });

  it("kürzt mit Auslassungszeichen auf die verfügbare Breite", () => {
    const gekuerzt = textKuerzen("Col du Grand-Saint-Bernard", messen, 200);
    expect(gekuerzt.endsWith("…")).toBe(true);
    expect(messen(gekuerzt)).toBeLessThanOrEqual(200);
  });

  it("lässt kein Leerzeichen vor dem Auslassungszeichen stehen", () => {
    // "Col du " + "…" hat 8 Zeichen = 160; "Col du…" hat 7.
    expect(textKuerzen("Col du Pillon", messen, 160)).toBe("Col du…");
  });
});

describe("monatsBalken", () => {
  const box = { x: 72, breite: 936, hoehe: 64 };

  it("verteilt zwölf Balken mittig in gleich breite Felder", () => {
    const balken = monatsBalken(new Array(12).fill(1), box);
    expect(balken).toHaveLength(12);
    const feld = box.breite / 12;
    balken.forEach((b, i) => {
      expect(b.breite).toBeLessThanOrEqual(24);
      expect(b.x + b.breite / 2).toBeCloseTo(box.x + i * feld + feld / 2, 6);
    });
  });

  it("skaliert auf den stärksten Monat und hält kleine Monate sichtbar", () => {
    const proMonat = [0, 0, 0, 0, 1, 20, 0, 0, 0, 0, 0, 0];
    const balken = monatsBalken(proMonat, box);
    expect(balken[5].hoehe).toBe(64);
    expect(balken[4].hoehe).toBe(8);
    expect(balken[0].hoehe).toBe(0);
  });

  it("zeichnet ohne Fahrten keine Balken", () => {
    expect(monatsBalken(new Array(12).fill(0), box).every((b) => b.hoehe === 0)).toBe(true);
  });
});

describe("zahlCH / saisonDateiname", () => {
  it("setzt das Schweizer Hochkomma als Tausendertrennung", () => {
    expect(zahlCH(0)).toBe("0");
    expect(zahlCH(999)).toBe("999");
    expect(zahlCH(12345.6)).toBe("12’346");
    expect(zahlCH(1234567)).toBe("1’234’567");
  });

  it("benennt die Datei nach Jahr und Format", () => {
    expect(saisonDateiname(2026, "story")).toBe("strado-saison-2026-story.jpg");
  });
});
