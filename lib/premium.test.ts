import { describe, it, expect } from "vitest";
import {
  MAX_FOTOS_GRATIS,
  MAX_FOTOS_PREMIUM,
  MAX_OFFLINE_STRECKEN_GRATIS,
  MAX_PRIVATE_STRECKEN_GRATIS,
  kaufseiteOffen,
  maxFotosProFahrt,
} from "./premiumLimits";

// getPremiumStatus() und privateStreckenKontingent() lesen über den an die
// Session gebundenen Supabase-Client und sind damit hier nicht ohne Attrappe
// prüfbar; ihre eigentliche Zusicherung — dass niemand fremde oder erhöhte
// Rechte bekommt — liegt ohnehin in der Datenbank (Policies und Grants aus
// 0063/0064) und nicht in diesem Modul.
//
// Was hier steht, sind die Grenzwerte selbst. Sie sind keine Detailfrage:
// jeder einzelne ist eine in den AGB veröffentlichte Zusage, und ein
// stilles Verschieben wäre genau die Art Änderung, die Kernregel 16
// untersagt. Die Tests halten sie deshalb fest, statt sie zu berechnen.

describe("Grenzwerte", () => {
  it("lässt die Gratis-Fotogrenze auf dem heutigen Wert", () => {
    // Additives Gating: was ein kostenloses Konto vor dem Launch konnte,
    // kann es danach weiterhin. 6 war der Wert vor Premium.
    expect(MAX_FOTOS_GRATIS).toBe(6);
  });

  it("verdoppelt die Fotogrenze mit Premium", () => {
    expect(MAX_FOTOS_PREMIUM).toBe(12);
    expect(MAX_FOTOS_PREMIUM).toBeGreaterThan(MAX_FOTOS_GRATIS);
  });

  it("gibt genau eine private Strecke kostenlos frei", () => {
    // Nicht null: die Funktion soll ohne Abo erlebbar bleiben und nicht
    // bloss als gesperrtes Symbol dastehen. Der Wert steht so auch in den
    // AGB Ziff. 3.2 und in darf_private_strecke_anlegen() (Migration 0064).
    expect(MAX_PRIVATE_STRECKEN_GRATIS).toBe(1);
  });

  it("erlaubt drei Offline-Strecken ohne Abo", () => {
    expect(MAX_OFFLINE_STRECKEN_GRATIS).toBe(3);
  });
});

describe("maxFotosProFahrt", () => {
  it("gibt die Premium-Grenze für ein laufendes Abo", () => {
    expect(maxFotosProFahrt(true)).toBe(MAX_FOTOS_PREMIUM);
  });

  it("gibt die Gratis-Grenze ohne Abo", () => {
    expect(maxFotosProFahrt(false)).toBe(MAX_FOTOS_GRATIS);
  });

  // Der Fall, der beim Ende eines Abos zählt: die Grenze sinkt, aber sie
  // sinkt nur für NEUE Fotos. Bereits gespeicherte bleiben (AGB Ziff. 9.2),
  // weil die Grenze beim Hochladen greift und nicht beim Anzeigen — hier
  // festgehalten, damit niemand auf die Idee kommt, sie auch beim Lesen
  // anzuwenden.
  it("ist eine Obergrenze fürs Hochladen, nicht fürs Anzeigen", () => {
    expect(maxFotosProFahrt(false)).toBeLessThan(MAX_FOTOS_PREMIUM);
  });
});

describe("kaufseiteOffen", () => {
  it("öffnet die Kaufseite ohne Premium", () => {
    expect(kaufseiteOffen({ aktiv: false, quelle: null })).toBe(true);
  });

  it("öffnet sie mit einem Saisonpass, der von selbst ausläuft (0110)", () => {
    expect(kaufseiteOffen({ aktiv: true, quelle: "saisonpass" })).toBe(true);
  });

  it("öffnet sie mit Gratis-Premium aus dem Signup-Link (0135)", () => {
    // Der Anlass: bis 0135 lief das unter "manuell", und genau die Konten,
    // die der Link zum Kauf führen soll, wurden auf /profil umgeleitet.
    expect(kaufseiteOffen({ aktiv: true, quelle: "gratis" })).toBe(true);
  });

  it("schickt ein laufendes Abo und von Hand gesetztes Premium weg", () => {
    expect(kaufseiteOffen({ aktiv: true, quelle: "abo" })).toBe(false);
    expect(kaufseiteOffen({ aktiv: true, quelle: "manuell" })).toBe(false);
  });
});
