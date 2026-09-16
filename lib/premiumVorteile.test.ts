import { describe, it, expect } from "vitest";
import { PREMIUM_VORTEILE, premiumKurzform } from "@/lib/premiumVorteile";

// Diese Datei hält die Regel "eine Liste, ein Ort" offen (siehe
// docs/design-vereinfachung.md, Anhang C2, Regel 3).
//
// Der Anlass ist ein echter Vorfall: die Profilseite trug eine dritte, von
// Hand gepflegte Kopie der Vorteile und warb nach Migration 0086 weiter mit
// "Eigene Strecken erstellen", während das Erstellen längst wieder kostenlos
// war. Ein Verkaufsversprechen, das nicht mehr stimmte — und weil es eine
// zugesagte Vertragsleistung betrifft (AGB Ziff. 3.2), ist das keine
// Kosmetik.
describe("premiumKurzform", () => {
  it("leitet sich aus PREMIUM_VORTEILE ab statt daneben zu existieren", () => {
    const kurz = premiumKurzform();
    // Jeder Teil der Kurzform muss in der Langform vorkommen — sonst ist
    // wieder eine eigenständige Fassung entstanden.
    for (const teil of kurz.split(" · ")) {
      const passt = PREMIUM_VORTEILE.some((v) => v.replace(/\s*\([^)]*\)/g, "") === teil);
      expect(passt, `"${teil}" steht in keiner Zeile von PREMIUM_VORTEILE`).toBe(true);
    }
  });

  it("nimmt die ersten drei Punkte, in der Reihenfolge der Langform", () => {
    expect(premiumKurzform().split(" · ")).toHaveLength(3);
    expect(premiumKurzform().startsWith(PREMIUM_VORTEILE[0])).toBe(true);
  });

  // Die Klammer-Einschränkungen ("(ohne Abo: eine)") gehören in die
  // Aufzählung auf der Kaufseite, wo Platz dafür ist. In einer Zeile aus
  // drei Punkten stören sie — und sie wegzulassen ist unbedenklich, weil
  // niemand kauft, ohne vorher die volle Liste gesehen zu haben.
  it("lässt die Klammer-Einschränkungen weg", () => {
    expect(premiumKurzform()).not.toContain("(");
    expect(premiumKurzform()).not.toContain(")");
  });

  // Der Trenner ist derselbe Mittelpunkt wie in Kennzahlenzeile
  // (components/ui/Kennzahl.tsx) — eine Aufzählung in einer Zeile sieht in
  // der ganzen App gleich aus.
  it("trennt mit Mittelpunkt und Leerzeichen", () => {
    expect(premiumKurzform()).toContain(" · ");
    expect(premiumKurzform()).not.toContain(",");
  });
});
