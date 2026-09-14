import { describe, it, expect } from "vitest";
import {
  STARTBILDER,
  istErlaubteStartbildGroesse,
  startbildEintraege,
  startbildMedia,
  startbildPixel,
  startbildUrl,
} from "@/lib/startbilder";

describe("Startbilder für iOS", () => {
  // Der Kern der Sache: Safari nimmt ein Startbild nur bei exakter
  // Übereinstimmung. Zwei Einträge mit derselben Abfrage bedeuten, dass einer
  // davon nie zum Zug kommt — und zwar stumm.
  it("hat für jedes Gerät genau eine Media-Abfrage", () => {
    const abfragen = STARTBILDER.map(startbildMedia);
    expect(new Set(abfragen).size).toBe(abfragen.length);
  });

  // Die beiden 414×896-Geräte (iPhone 11 und 11 Pro Max) unterscheiden sich
  // ausschliesslich in der Pixeldichte. Fiele sie aus der Abfrage, bekäme
  // eines der beiden ein Bild in der falschen Auflösung.
  it("unterscheidet gleich grosse Geräte über die Pixeldichte", () => {
    const gleichGross = STARTBILDER.filter((b) => b.breite === 414 && b.hoehe === 896);
    expect(gleichGross).toHaveLength(2);
    expect(new Set(gleichGross.map((b) => b.dichte)).size).toBe(2);
    for (const bild of gleichGross) {
      expect(startbildMedia(bild)).toContain(`-webkit-device-pixel-ratio: ${bild.dichte}`);
    }
  });

  it("nennt in jeder Abfrage Breite, Höhe und Dichte in Gerätemaßen", () => {
    for (const bild of STARTBILDER) {
      const abfrage = startbildMedia(bild);
      expect(abfrage).toContain(`(device-width: ${bild.breite}px)`);
      expect(abfrage).toContain(`(device-height: ${bild.hoehe}px)`);
      expect(abfrage).toContain(`(-webkit-device-pixel-ratio: ${bild.dichte})`);
    }
  });

  // Die Pixelmaße sind Punktmaß × Dichte und dürfen nicht auseinanderlaufen:
  // die Route zeichnet nach den Pixeln, die Abfrage prüft die Punkte.
  it("rechnet die Bildgrösse aus Punktmaß und Dichte", () => {
    expect(startbildPixel({ breite: 393, hoehe: 852, dichte: 3, geraete: "" })).toEqual({
      breite: 1179,
      hoehe: 2556,
    });
    for (const bild of STARTBILDER) {
      const pixel = startbildPixel(bild);
      expect(pixel.breite).toBe(bild.breite * bild.dichte);
      expect(pixel.hoehe).toBe(bild.hoehe * bild.dichte);
      expect(Number.isInteger(pixel.breite)).toBe(true);
      expect(Number.isInteger(pixel.hoehe)).toBe(true);
    }
  });

  it("baut die Adresse mit genau den Pixelmaßen, die die Route prüft", () => {
    for (const bild of STARTBILDER) {
      const pixel = startbildPixel(bild);
      expect(startbildUrl(bild)).toBe(`/startbild?b=${pixel.breite}&h=${pixel.hoehe}`);
      expect(istErlaubteStartbildGroesse(pixel.breite, pixel.hoehe)).toBe(true);
    }
  });

  it("liefert für jedes Gerät einen Eintrag aus Adresse und Abfrage", () => {
    const eintraege = startbildEintraege();
    expect(eintraege).toHaveLength(STARTBILDER.length);
    for (const eintrag of eintraege) {
      expect(eintrag.url.startsWith("/startbild?")).toBe(true);
      expect(eintrag.media).toContain("device-width");
    }
  });

  // Die Route ist öffentlich und liest ihre Maße aus der Adresszeile. Alles,
  // was nicht in der Tabelle steht, muss abgelehnt werden — sonst ist die
  // Bildgrösse eine Eingabe von aussen.
  it("lehnt jede Grösse ab, die nicht in der Tabelle steht", () => {
    const verboten: [number, number][] = [
      [0, 0],
      [-1179, -2556],
      [20000, 20000],
      [1179.5, 2556],
      [1179, 2555],
      [2556, 1179], // Querformat: bewusst nicht vorgesehen
      [Number.NaN, Number.NaN],
      [Number.POSITIVE_INFINITY, 2556],
    ];
    for (const [breite, hoehe] of verboten) {
      expect(istErlaubteStartbildGroesse(breite, hoehe)).toBe(false);
    }
  });
});
