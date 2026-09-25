import { describe, expect, it } from "vitest";
import { loeschGruppen, mitHoechstens, type MeldungsSchluessel } from "@/lib/passAbgleich";

const z = (situation_id: string, pass_id: string): MeldungsSchluessel => ({ situation_id, pass_id });

// Was eine Gruppe in der Datenbank träfe: das Kreuzprodukt ihrer Listen,
// geschnitten mit dem, was in der Tabelle steht.
function getroffen(gruppen: ReturnType<typeof loeschGruppen>, tabelle: MeldungsSchluessel[]) {
  return tabelle.filter((zeile) =>
    gruppen.some((g) => g.situationIds.includes(zeile.situation_id) && g.passIds.includes(zeile.pass_id)),
  );
}

describe("loeschGruppen", () => {
  it("braucht ohne wegfallende Zeilen keine Anweisung", () => {
    expect(loeschGruppen([], [z("s1", "klausen")])).toEqual([]);
  });

  it("löscht im Normalfall mit einer einzigen Anweisung", () => {
    const weg = [z("s1", "klausen"), z("s2", "klausen"), z("s3", "furka")];
    const bleibt = [z("s9", "grimsel")];
    const gruppen = loeschGruppen(weg, bleibt);
    expect(gruppen).toHaveLength(1);
    expect(getroffen(gruppen, [...weg, ...bleibt])).toEqual(weg);
  });

  // Das Kreuzprodukt s1×furka träfe eine Zeile, die bleiben soll — dann je
  // Pass eine Anweisung, und nichts Bleibendes wird gelöscht.
  it("teilt nach Pass, wenn das Kreuzprodukt eine bleibende Zeile träfe", () => {
    const weg = [z("s1", "klausen"), z("s2", "furka")];
    const bleibt = [z("s1", "furka")];
    const gruppen = loeschGruppen(weg, bleibt);
    expect(gruppen).toHaveLength(2);
    const tabelle = [...weg, ...bleibt];
    expect(getroffen(gruppen, tabelle)).toEqual(weg);
  });

  // Die eben geschriebenen Treffer gehören zum Bleibenden, auch wenn sie
  // beim Lesen der Tabelle noch nicht da waren.
  it("schützt eben geschriebene Treffer", () => {
    const weg = [z("s1", "klausen"), z("s2", "susten")];
    const neuGeschrieben = [z("s2", "klausen")];
    const gruppen = loeschGruppen(weg, neuGeschrieben);
    expect(getroffen(gruppen, [...weg, ...neuGeschrieben])).toEqual(weg);
  });
});

describe("mitHoechstens", () => {
  it("hält die Grenze ein und liefert die Ergebnisse in Eingabereihenfolge", async () => {
    let laufend = 0;
    let hoechstens = 0;
    const ergebnisse = await mitHoechstens([5, 1, 4, 2, 3, 0, 6], 3, async (ms, i) => {
      laufend += 1;
      hoechstens = Math.max(hoechstens, laufend);
      await new Promise((r) => setTimeout(r, ms));
      laufend -= 1;
      return i * 10;
    });
    expect(hoechstens).toBe(3);
    expect(ergebnisse).toEqual([0, 10, 20, 30, 40, 50, 60]);
  });

  it("kommt mit einer leeren Liste aus", async () => {
    expect(await mitHoechstens([], 6, async () => 1)).toEqual([]);
  });
});
