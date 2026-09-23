import { describe, expect, it } from "vitest";
import {
  baueHeatmap,
  fasseGleicheTageZusammen,
  fensterText,
  istFlach,
  ruhigstesFenster,
  skalaFuerPunkte,
  spitzeText,
  startzeitenSatz,
  stufeFuerFaktor,
  tageText,
  tageTextLang,
  vollsteZeit,
  WERKTAGE,
  type Startzeit,
  type VerkehrsPunkt,
  type VerkehrsStufe,
} from "@/lib/ruhigeZeiten";

function punkte(werte: [number, number, number][]): VerkehrsPunkt[] {
  return werte.map(([wochentag, stunde, faktor]) => ({ wochentag, stunde, faktor }));
}

const STUNDEN = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

/** Eine Woche aus Zeilen je Wochentag (Mo … So), Stunden 6–19. */
function woche(zeilen: number[][]): VerkehrsPunkt[] {
  return zeilen.flatMap((werte, i) =>
    werte.map((faktor, j) => ({ wochentag: i + 1, stunde: STUNDEN[j], faktor })),
  );
}

// Das gespeicherte Profil des Furkapasses (f1ffb1c9-…), abgefragt am
// 2026-09-23, berechnet am 2026-09-22. Mit den alten festen Schwellen waren
// 77 der 98 Zellen "Dichter" und 8 "Zäh" — Montag 6 Uhr (1.18) eingeschlossen.
const FURKA = woche([
  [1.18, 1.14, 1.16, 1.16, 1.23, 1.27, 1.3, 1.32, 1.27, 1.25, 1.27, 1.19, 1.17, 1.18],
  [1.18, 1.14, 1.16, 1.16, 1.24, 1.27, 1.3, 1.32, 1.28, 1.25, 1.27, 1.2, 1.18, 1.18],
  [1.18, 1.14, 1.16, 1.17, 1.24, 1.27, 1.3, 1.32, 1.27, 1.25, 1.27, 1.19, 1.17, 1.18],
  [1.18, 1.14, 1.16, 1.17, 1.24, 1.27, 1.3, 1.32, 1.27, 1.25, 1.27, 1.19, 1.18, 1.18],
  [1.18, 1.14, 1.16, 1.17, 1.24, 1.27, 1.31, 1.32, 1.28, 1.25, 1.27, 1.2, 1.18, 1.18],
  [1.01, 1.0, 1.06, 1.14, 1.27, 1.29, 1.31, 1.28, 1.31, 1.29, 1.27, 1.2, 1.18, 1.2],
  [1.01, 1.0, 1.05, 1.13, 1.26, 1.28, 1.3, 1.27, 1.3, 1.28, 1.27, 1.2, 1.18, 1.19],
]);

function anteile(daten: VerkehrsPunkt[]): Record<VerkehrsStufe, number> {
  const skala = skalaFuerPunkte(daten);
  const zaehler: Record<VerkehrsStufe, number> = { ruhig: 0, normal: 0, dicht: 0, zaeh: 0 };
  for (const p of daten) zaehler[stufeFuerFaktor(p.faktor, skala)] += 1;
  return zaehler;
}

describe("skalaFuerPunkte / stufeFuerFaktor", () => {
  it("misst an der eigenen Woche: 10. und 90. Perzentil", () => {
    const skala = skalaFuerPunkte(FURKA);
    expect(skala.unten).toBeCloseTo(1.14, 2);
    expect(skala.oben).toBeCloseTo(1.3, 2);
    expect(skala.flach).toBe(false);
  });

  it("teilt die Spannweite in vier gleich breite Stufen", () => {
    const skala = { unten: 1.1, oben: 1.3, flach: false };
    expect(stufeFuerFaktor(1.0, skala)).toBe("ruhig");
    expect(stufeFuerFaktor(1.15, skala)).toBe("ruhig");
    expect(stufeFuerFaktor(1.18, skala)).toBe("normal");
    expect(stufeFuerFaktor(1.24, skala)).toBe("dicht");
    expect(stufeFuerFaktor(1.27, skala)).toBe("zaeh");
    expect(stufeFuerFaktor(1.6, skala)).toBe("zaeh");
  });

  it("macht aus dem Furkapass keine Karte mehr, auf der alles dicht ist", () => {
    const zaehler = anteile(FURKA);
    // Jede Stufe kommt vor, keine beherrscht die Karte.
    for (const stufe of Object.values(zaehler)) {
      expect(stufe).toBeGreaterThan(0);
      expect(stufe).toBeLessThan(50);
    }
  });

  it("liest Montag 7 Uhr am Furka als ruhig und Mittag als am vollsten", () => {
    const skala = skalaFuerPunkte(FURKA);
    expect(stufeFuerFaktor(1.14, skala)).toBe("ruhig");
    expect(stufeFuerFaktor(1.0, skala)).toBe("ruhig");
    expect(stufeFuerFaktor(1.32, skala)).toBe("zaeh");
  });

  it("gibt einer flachen Woche keine Stufen", () => {
    const flach = woche(Array.from({ length: 7 }, () => STUNDEN.map((_, i) => 1 + (i % 3) * 0.02)));
    const skala = skalaFuerPunkte(flach);
    expect(skala.flach).toBe(true);
    expect(stufeFuerFaktor(1.04, skala)).toBe("ruhig");
  });

  it("ist ohne Daten flach", () => {
    expect(skalaFuerPunkte([]).flach).toBe(true);
  });

  it("verschiebt sich nicht wegen einer einzelnen Ausreisserzelle", () => {
    const basis = woche(Array.from({ length: 7 }, () => STUNDEN.map((_, i) => 1.1 + i * 0.01)));
    const mitAusreisser = basis.map((p) =>
      p.wochentag === 6 && p.stunde === 7 ? { ...p, faktor: 1.0 } : p,
    );
    expect(skalaFuerPunkte(mitAusreisser).unten).toBeCloseTo(skalaFuerPunkte(basis).unten, 2);
  });
});

describe("baueHeatmap", () => {
  it("baut sieben Zeilen über die vorhandenen Stunden", () => {
    const karte = baueHeatmap(punkte([
      [1, 8, 1.0],
      [1, 9, 1.1],
      [6, 9, 1.4],
    ]));

    expect(karte?.stunden).toEqual([8, 9]);
    expect(karte?.zeilen).toHaveLength(7);
    expect(karte?.zeilen[0]).toEqual({ wochentag: 1, tage: [1], werte: [1.0, 1.1] });
    // Samstag hat nur 9 Uhr — die Lücke bleibt eine Lücke.
    expect(karte?.zeilen[5]).toEqual({ wochentag: 6, tage: [6], werte: [null, 1.4] });
    expect(karte?.zeilen[1].werte).toEqual([null, null]);
  });

  it("liefert ohne Daten nichts statt eines leeren Rasters", () => {
    expect(baueHeatmap([])).toBeNull();
  });
});

describe("fasseGleicheTageZusammen", () => {
  it("macht aus fünf gleichen Werktagen eine Zeile Mo–Fr", () => {
    const karte = fasseGleicheTageZusammen(baueHeatmap(FURKA)!);
    expect(karte.zeilen.map((z) => z.tage)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
    // Mittel der Gruppe, auf zwei Stellen.
    expect(karte.zeilen[0].werte[0]).toBe(1.18);
    expect(karte.zeilen[0].werte[4]).toBe(1.24);
  });

  it("lässt verschiedene Tage getrennt", () => {
    const karte = fasseGleicheTageZusammen(baueHeatmap(punkte([
      [1, 8, 1.0], [2, 8, 1.1], [3, 8, 1.11],
    ]))!);
    expect(karte.zeilen.map((z) => z.tage)).toEqual([[1], [2, 3], [4, 5, 6, 7]]);
    // Leere Tage bleiben leer, auch zusammengefasst.
    expect(karte.zeilen[2].werte).toEqual([null]);
  });

  it("fasst nur aufeinanderfolgende Tage zusammen", () => {
    const karte = fasseGleicheTageZusammen(baueHeatmap(punkte([
      [1, 8, 1.0], [2, 8, 1.3], [3, 8, 1.0], [4, 8, 1.3], [5, 8, 1.0], [6, 8, 1.3], [7, 8, 1.0],
    ]))!);
    expect(karte.zeilen).toHaveLength(7);
  });
});

describe("istFlach", () => {
  it("erkennt eine Woche ohne nennenswerte Unterschiede", () => {
    expect(istFlach(punkte([[1, 8, 1.0], [6, 11, 1.04]]))).toBe(true);
  });

  it("erkennt einen Unterschied, sobald es einen gibt", () => {
    expect(istFlach(punkte([[1, 8, 1.0], [6, 11, 1.35]]))).toBe(false);
  });
});

describe("tageText", () => {
  it("schreibt Tage so, wie man sie liest", () => {
    expect(tageText([1, 2, 3, 4, 5])).toBe("Mo–Fr");
    expect(tageText([7, 6])).toBe("Sa–So");
    expect(tageText([2, 3, 4])).toBe("Di–Do");
    expect(tageText([1, 3])).toBe("Mo, Mi");
    expect(tageText([1, 2, 3, 4, 5, 6, 7])).toBe("täglich");
    expect(tageText([4])).toBe("Do");
  });

  it("gibt Vorlesesoftware die langen Namen", () => {
    expect(tageTextLang([1, 2, 3, 4, 5])).toBe("Montag bis Freitag");
    expect(tageTextLang([6, 7])).toBe("Samstag und Sonntag");
    expect(tageTextLang([2])).toBe("Dienstag");
  });
});

describe("ruhigstesFenster", () => {
  it("findet das ruhigste zusammenhängende Fenster und alle Tage, an denen es gilt", () => {
    const werte: [number, number, number][] = [];
    for (const tag of [1, 2, 3, 4, 5]) {
      werte.push([tag, 7, 1.0], [tag, 8, 1.02], [tag, 9, 1.04], [tag, 10, 1.2], [tag, 11, 1.3]);
    }
    for (const tag of [6, 7]) {
      werte.push([tag, 7, 1.2], [tag, 8, 1.3], [tag, 9, 1.5], [tag, 10, 1.6], [tag, 11, 1.7]);
    }

    const fenster = ruhigstesFenster(punkte(werte));
    expect(fenster).toMatchObject({ tage: [1, 2, 3, 4, 5], wochenende: false, vonStunde: 7, bisStunde: 10 });
    expect(fensterText(fenster!)).toBe("Mo–Fr 7–10 Uhr");
  });

  it("nennt am Furka das Wochenende früh — und unter der Woche Mo–Fr", () => {
    const fenster = ruhigstesFenster(FURKA);
    expect(fenster).toMatchObject({ tage: [6, 7], wochenende: true, vonStunde: 6, bisStunde: 9 });
    expect(fensterText(fenster!)).toBe("Sa–So 6–9 Uhr");

    const werktags = ruhigstesFenster(FURKA, WERKTAGE);
    expect(fensterText(werktags!)).toBe("Mo–Fr 7–10 Uhr");
  });

  it("nennt nur die Tage, die wirklich gleich ruhig sind", () => {
    const werte: [number, number, number][] = [];
    for (const tag of [1, 2, 3, 4, 5, 6, 7]) {
      const zuschlag = tag === 2 || tag === 3 || tag === 4 ? 0 : 0.1;
      werte.push([tag, 7, 1.0 + zuschlag], [tag, 8, 1.0 + zuschlag], [tag, 9, 1.01 + zuschlag]);
    }
    expect(fensterText(ruhigstesFenster(punkte(werte))!)).toBe("Di–Do 7–10 Uhr");
  });

  it("überspringt Lücken statt über sie hinweg zu empfehlen", () => {
    // 7, 8 und dann erst wieder 14, 15, 16: nur der hintere Block ist
    // zusammenhängend genug für ein Fenster.
    const werte: [number, number, number][] = [
      [1, 7, 1.0], [1, 8, 1.0],
      [1, 14, 1.1], [1, 15, 1.1], [1, 16, 1.1],
    ];
    expect(ruhigstesFenster(punkte(werte))).toMatchObject({ vonStunde: 14, bisStunde: 17 });
  });

  it("fällt ohne drei zusammenhängende Stunden auf die ruhigste einzelne zurück", () => {
    const werte: [number, number, number][] = [[1, 7, 1.2], [1, 9, 1.0], [1, 11, 1.1]];
    expect(ruhigstesFenster(punkte(werte))).toMatchObject({ tage: [1], vonStunde: 9, bisStunde: 10 });
  });

  it("liefert ohne Daten nichts", () => {
    expect(ruhigstesFenster([])).toBeNull();
    expect(ruhigstesFenster(punkte([[6, 8, 1.0]]), WERKTAGE)).toBeNull();
  });
});

describe("vollsteZeit", () => {
  it("findet die Spitze", () => {
    expect(vollsteZeit(punkte([[1, 8, 1.1], [7, 15, 1.8], [6, 10, 1.4]]))).toMatchObject({
      tage: [7],
      stunde: 15,
    });
  });

  it("nennt alle Tage mit derselben Spitze", () => {
    expect(spitzeText(vollsteZeit(FURKA)!)).toBe("Mo–Fr um 13 Uhr");
  });

  it("liefert ohne Daten nichts", () => {
    expect(vollsteZeit([])).toBeNull();
  });
});

describe("startzeitenSatz", () => {
  it("nennt die häufigste Startzeit", () => {
    const zeiten: Startzeit[] = [
      { wochentag: 7, tageszeit: "morgen", anteil: 35 },
      { wochentag: 6, tageszeit: "nachmittag", anteil: 20 },
    ];
    expect(startzeitenSatz(zeiten)).toBe("Auf Strado wird am häufigsten am Sonntagmorgen gestartet.");
  });

  it("schweigt, wenn sich die Starts gleichmässig verteilen", () => {
    const zeiten: Startzeit[] = [
      { wochentag: 1, tageszeit: "morgen", anteil: 12 },
      { wochentag: 2, tageszeit: "abend", anteil: 11 },
    ];
    expect(startzeitenSatz(zeiten)).toBeNull();
  });

  it("schweigt ohne Daten", () => {
    expect(startzeitenSatz([])).toBeNull();
  });
});
