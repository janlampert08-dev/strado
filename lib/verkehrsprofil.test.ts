import { describe, expect, it } from "vitest";
import {
  abfrageZeitpunkte,
  faktorenAusDauern,
  isoWochentag,
  MAX_STUETZPUNKTE,
  PROFIL_STUNDEN,
  stuetzpunkte,
} from "@/lib/verkehrsprofil";

describe("stuetzpunkte", () => {
  it("behält Anfang und Ende und bleibt unter der Grenze der Directions-API", () => {
    const linie: [number, number][] = Array.from({ length: 400 }, (_, i) => [8 + i / 1000, 46.5]);
    const punkte = stuetzpunkte(linie);

    expect(punkte).toHaveLength(MAX_STUETZPUNKTE);
    expect(punkte[0]).toEqual(linie[0]);
    expect(punkte.at(-1)).toEqual(linie.at(-1));
  });

  it("lässt eine kurze Geometrie unangetastet", () => {
    const linie: [number, number][] = [[8, 46.5], [8.1, 46.6]];
    expect(stuetzpunkte(linie)).toEqual(linie);
  });
});

describe("isoWochentag", () => {
  it("zählt Montag als 1 und Sonntag als 7", () => {
    expect(isoWochentag("2026-09-21")).toBe(1);
    expect(isoWochentag("2026-09-27")).toBe(7);
  });
});

describe("abfrageZeitpunkte", () => {
  const zeitpunkte = abfrageZeitpunkte(new Date("2026-09-17T12:00:00Z"));

  it("deckt sieben Tage mal Profilstunden ab", () => {
    expect(zeitpunkte).toHaveLength(7 * PROFIL_STUNDEN.length);
    expect(new Set(zeitpunkte.map((z) => z.wochentag)).size).toBe(7);
  });

  it("fragt nur künftige Zeitpunkte ab", () => {
    // depart_at braucht die Zukunft; der erste Tag ist deshalb morgen.
    expect(zeitpunkte[0].abfahrtLokal.startsWith("2026-09-18")).toBe(true);
  });

  it("hält die Ortszeit als Zeichenkette fest, nicht als Date", () => {
    // Der Fehler, den das verhindert: `new Date("2026-09-18T07:00")` ist
    // Ortszeit des Servers — auf Vercel UTC, in der Schweiz also 9 Uhr.
    const sieben = zeitpunkte.find((z) => z.stunde === 7);
    expect(sieben?.abfahrtLokal).toBe("2026-09-18T07:00");
  });

  it("gibt jedem Zeitpunkt den Wochentag seines Datums", () => {
    const freitag = zeitpunkte.find((z) => z.abfahrtLokal.startsWith("2026-09-18"));
    expect(freitag?.wochentag).toBe(5);
  });
});

describe("faktorenAusDauern", () => {
  it("macht die schnellste Stunde zur 1.00", () => {
    const ergebnis = faktorenAusDauern([
      { wochentag: 1, stunde: 7, dauerSekunden: 1200 },
      { wochentag: 6, stunde: 11, dauerSekunden: 1500 },
    ]);

    expect(ergebnis?.basisSekunden).toBe(1200);
    expect(ergebnis?.faktoren).toEqual([
      { wochentag: 1, stunde: 7, faktor: 1 },
      { wochentag: 6, stunde: 11, faktor: 1.25 },
    ]);
  });

  it("überspringt fehlgeschlagene Abrufe statt sie als 0 zu zählen", () => {
    const ergebnis = faktorenAusDauern([
      { wochentag: 1, stunde: 7, dauerSekunden: 0 },
      { wochentag: 1, stunde: 8, dauerSekunden: Number.NaN },
      { wochentag: 1, stunde: 9, dauerSekunden: 900 },
    ]);
    expect(ergebnis?.basisSekunden).toBe(900);
    expect(ergebnis?.faktoren).toHaveLength(1);
  });

  it("kappt Ausreisser an der Grenze der Spalte", () => {
    const ergebnis = faktorenAusDauern([
      { wochentag: 1, stunde: 7, dauerSekunden: 600 },
      { wochentag: 7, stunde: 15, dauerSekunden: 9000 },
    ]);
    expect(ergebnis?.faktoren.at(-1)?.faktor).toBe(5);
  });

  it("liefert ohne brauchbare Messung nichts", () => {
    expect(faktorenAusDauern([])).toBeNull();
    expect(faktorenAusDauern([{ wochentag: 1, stunde: 7, dauerSekunden: 0 }])).toBeNull();
  });
});
