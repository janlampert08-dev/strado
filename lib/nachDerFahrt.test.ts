import { describe, expect, it } from "vitest";
import { installationsWeg, premiumSatzZurFahrt } from "@/lib/nachDerFahrt";

describe("installationsWeg", () => {
  const ios = { plattform: "ios", standalone: false } as const;
  const android = { plattform: "android", standalone: false } as const;

  it("zeigt dem iPhone die Anleitung, Android den Knopf", () => {
    expect(installationsWeg({ geraet: ios, hatAngebot: false, erledigt: false })).toBe("ios-anleitung");
    expect(installationsWeg({ geraet: android, hatAngebot: true, erledigt: false })).toBe("knopf");
  });

  it("fragt nicht, wenn schon installiert, abgelehnt oder am Desktop", () => {
    expect(
      installationsWeg({ geraet: { plattform: "ios", standalone: true }, hatAngebot: false, erledigt: false }),
    ).toBeNull();
    expect(installationsWeg({ geraet: ios, hatAngebot: false, erledigt: true })).toBeNull();
    expect(
      installationsWeg({ geraet: { plattform: "desktop", standalone: false }, hatAngebot: true, erledigt: false }),
    ).toBeNull();
  });

  it("erfindet auf Android ohne Angebot des Browsers keine Anleitung", () => {
    expect(installationsWeg({ geraet: android, hatAngebot: false, erledigt: false })).toBeNull();
  });
});

describe("premiumSatzZurFahrt", () => {
  const grenzen = { maxFotosGratis: 6, maxFotosPremium: 12 };

  it("spricht die Fotogrenze an, wenn sie erreicht ist", () => {
    expect(premiumSatzZurFahrt({ streckenfahrt: true, fotos: 6, ...grenzen })).toContain("12 statt 6 Fotos");
  });

  it("nennt bei einer Streckenfahrt das Wetterfenster, sonst die Auswertung", () => {
    expect(premiumSatzZurFahrt({ streckenfahrt: true, fotos: 0, ...grenzen })).toContain("trocken");
    expect(premiumSatzZurFahrt({ streckenfahrt: false, fotos: 2, ...grenzen })).toContain("Jahr und Fahrzeug");
  });

  it("endet ohne Punkt, weil PremiumHinweis den Satz schliesst", () => {
    for (const streckenfahrt of [true, false]) {
      for (const fotos of [0, 6]) {
        expect(premiumSatzZurFahrt({ streckenfahrt, fotos, ...grenzen })).not.toMatch(/[.!]$/);
      }
    }
  });
});
