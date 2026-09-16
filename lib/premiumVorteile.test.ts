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
  // Der schärfste der vier Tests, und er ist seit der Review von PR #254
  // schärfer als vorher: jeder Teil muss WÖRTLICH ein Eintrag der Liste
  // sein. Vorher liess er eine klammerbereinigte Fassung durchgehen — und
  // genau darüber ist die Regel des Dateikopfs verlorengegangen (siehe
  // unten).
  it("besteht aus Einträgen von PREMIUM_VORTEILE im Wortlaut", () => {
    for (const teil of premiumKurzform().split(" · ")) {
      const passt = PREMIUM_VORTEILE.some((v) => v === teil);
      expect(passt, `"${teil}" steht so in keiner Zeile von PREMIUM_VORTEILE`).toBe(true);
    }
  });

  it("nimmt drei Punkte, in der Reihenfolge der Langform", () => {
    const teile = premiumKurzform().split(" · ");
    expect(teile).toHaveLength(3);
    const reihenfolge = teile.map((t) => PREMIUM_VORTEILE.indexOf(t as never));
    expect(reihenfolge).toEqual([...reihenfolge].sort((a, b) => a - b));
  });

  // DIE REGEL, DIE DIESER DATEI IHREN ZWECK GIBT, ZUM ZWEITEN MAL.
  //
  // Der Kopf von lib/premiumVorteile.ts sagt über die Klammer in
  // "Unbegrenzt private Strecken (ohne Abo: eine)": sie stehe bewusst
  // dabei, denn "ein Vorteil, der verschweigt, was es auch ohne Abo gibt,
  // wird spätestens beim ersten Ausprobieren als Übertreibung gelesen".
  //
  // premiumKurzform() strich sie trotzdem — per Regex, mit der Begründung,
  // die Kaufseite zeige ja die volle Fassung. Nur sehen die Kurzform genau
  // die Konten OHNE Abo (Profilkarte, Einstellungen), also das Publikum,
  // für das der Satz geschrieben wurde. Die Kopie war damit nicht mehr von
  // Hand verrutscht wie nach 0086, sondern automatisch — dieselbe Falle,
  // eine Ebene tiefer.
  //
  // Die Lösung ist Auswahl statt Kürzung: ein Punkt mit Einschränkung
  // kommt gar nicht erst in die Zeile.
  it("kürzt keinen Eintrag um seine Einschränkung, sondern lässt ihn weg", () => {
    const kurz = premiumKurzform();
    expect(kurz).not.toContain("(");
    for (const eintrag of PREMIUM_VORTEILE.filter((v) => v.includes("("))) {
      const ohneKlammer = eintrag.replace(/\s*\([^)]*\)/g, "");
      expect(
        kurz,
        `"${ohneKlammer}" steht ohne seine Einschränkung in der Kurzform`,
      ).not.toContain(ohneKlammer);
    }
  });

  // Der Trenner ist derselbe Mittelpunkt wie in Kennzahlenzeile
  // (components/ui/Kennzahl.tsx) — eine Aufzählung in einer Zeile sieht in
  // der ganzen App gleich aus.
  it("trennt mit Mittelpunkt und Leerzeichen", () => {
    expect(premiumKurzform()).toContain(" · ");
    expect(premiumKurzform()).not.toContain(",");
  });
});
