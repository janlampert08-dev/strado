import { describe, expect, it } from "vitest";
import {
  PASSWORT_AENDERN_PFAD,
  WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN,
  wiederherstellungGiltFuer,
} from "@/lib/passwortWiederherstellung";

// Diese Funktion entscheidet, ob updatePassword() das aktuelle Passwort
// abfragt. Sagt sie fälschlich "ja, das ist eine Wiederherstellung", reicht
// eine unbeaufsichtigt offene Sitzung, um ein Konto zu übernehmen — deshalb
// stehen hier vor allem die Fälle, in denen sie NICHT gelten darf.
describe("wiederherstellungGiltFuer", () => {
  const userId = "11111111-2222-3333-4444-555555555555";
  const andererUser = "99999999-8888-7777-6666-555555555555";

  it("gilt für die Nutzer-ID, für die das Merkmal gesetzt wurde", () => {
    expect(wiederherstellungGiltFuer(userId, userId)).toBe(true);
  });

  it("gilt NICHT für ein anderes Konto auf demselben Gerät", () => {
    // Der eigentliche Grund, warum die ID im Cookie steht und nicht bloss
    // ein Ja/Nein: nach der Wiederherstellung meldet sich jemand anderes an.
    expect(wiederherstellungGiltFuer(andererUser, userId)).toBe(false);
  });

  it("gilt nicht ohne Cookie", () => {
    expect(wiederherstellungGiltFuer(undefined, userId)).toBe(false);
    expect(wiederherstellungGiltFuer(null, userId)).toBe(false);
    expect(wiederherstellungGiltFuer("", userId)).toBe(false);
  });

  it("gilt nicht ohne Nutzer-ID", () => {
    // Ein leerer Vergleichswert darf nicht dazu führen, dass ein leeres
    // Cookie plötzlich passt.
    expect(wiederherstellungGiltFuer("", "")).toBe(false);
    expect(wiederherstellungGiltFuer(userId, "")).toBe(false);
  });

  it("vergleicht exakt, nicht als Präfix", () => {
    expect(wiederherstellungGiltFuer(userId + "x", userId)).toBe(false);
    expect(wiederherstellungGiltFuer(userId.slice(0, -1), userId)).toBe(false);
  });
});

describe("Konstanten", () => {
  it("zeigt auf den Pfad, den requestPasswordReset als next-Ziel setzt", () => {
    // Der Callback setzt das Merkmal nur für genau diesen Pfad. Läuft er
    // auseinander, kommt niemand mehr durch den Zurücksetzen-Fluss.
    expect(PASSWORT_AENDERN_PFAD).toBe("/profil/passwort-aendern");
  });

  it("hält die Gültigkeit kurz", () => {
    expect(WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN).toBeLessThanOrEqual(30 * 60);
    expect(WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN).toBeGreaterThanOrEqual(5 * 60);
  });
});
