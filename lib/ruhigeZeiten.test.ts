import { describe, expect, it } from "vitest";
import {
  baueHeatmap,
  fensterText,
  istFlach,
  ruhigstesFenster,
  startzeitenSatz,
  stufeFuerFaktor,
  vollsteStunde,
  type Startzeit,
  type VerkehrsPunkt,
} from "@/lib/ruhigeZeiten";

function punkte(werte: [number, number, number][]): VerkehrsPunkt[] {
  return werte.map(([wochentag, stunde, faktor]) => ({ wochentag, stunde, faktor }));
}

describe("stufeFuerFaktor", () => {
  it("teilt die Faktoren in vier Stufen", () => {
    expect(stufeFuerFaktor(1)).toBe("ruhig");
    expect(stufeFuerFaktor(1.05)).toBe("ruhig");
    expect(stufeFuerFaktor(1.12)).toBe("normal");
    expect(stufeFuerFaktor(1.25)).toBe("dicht");
    expect(stufeFuerFaktor(1.6)).toBe("zaeh");
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
    expect(karte?.zeilen[0]).toEqual({ wochentag: 1, werte: [1.0, 1.1] });
    // Samstag hat nur 9 Uhr — die Lücke bleibt eine Lücke.
    expect(karte?.zeilen[5]).toEqual({ wochentag: 6, werte: [null, 1.4] });
    expect(karte?.zeilen[1].werte).toEqual([null, null]);
  });

  it("liefert ohne Daten nichts statt eines leeren Rasters", () => {
    expect(baueHeatmap([])).toBeNull();
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

describe("ruhigstesFenster", () => {
  it("findet das ruhigste zusammenhängende Fenster", () => {
    const werte: [number, number, number][] = [];
    for (const tag of [1, 2, 3, 4, 5]) {
      werte.push([tag, 7, 1.0], [tag, 8, 1.02], [tag, 9, 1.04], [tag, 10, 1.2], [tag, 11, 1.3]);
    }
    for (const tag of [6, 7]) {
      werte.push([tag, 7, 1.2], [tag, 8, 1.3], [tag, 9, 1.5], [tag, 10, 1.6], [tag, 11, 1.7]);
    }

    const fenster = ruhigstesFenster(punkte(werte));
    expect(fenster).toMatchObject({ wochenende: false, vonStunde: 7, bisStunde: 10 });
    expect(fensterText(fenster!)).toBe("werktags zwischen 7 und 10 Uhr");
  });

  it("empfiehlt das Wochenende, wenn es dort ruhiger ist", () => {
    const werte: [number, number, number][] = [];
    for (const tag of [1, 2, 3, 4, 5]) werte.push([tag, 8, 1.4], [tag, 9, 1.5], [tag, 10, 1.6]);
    for (const tag of [6, 7]) werte.push([tag, 8, 1.0], [tag, 9, 1.0], [tag, 10, 1.05]);

    expect(ruhigstesFenster(punkte(werte))).toMatchObject({ wochenende: true, vonStunde: 8 });
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

  it("liefert ohne Daten nichts", () => {
    expect(ruhigstesFenster([])).toBeNull();
  });
});

describe("vollsteStunde", () => {
  it("findet die Spitze", () => {
    expect(vollsteStunde(punkte([[1, 8, 1.1], [7, 15, 1.8], [6, 10, 1.4]]))).toMatchObject({
      wochentag: 7,
      stunde: 15,
    });
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
