import { describe, expect, it } from "vitest";
import {
  FAHRTEN_MILESTONES,
  PASS_MILESTONES,
  featuredMilestone,
  highestMilestone,
} from "@/lib/achievements";

describe("highestMilestone", () => {
  it("liefert null, solange der erste Meilenstein nicht erreicht ist", () => {
    expect(highestMilestone(0, [1, 5, 10])).toBeNull();
  });

  it("liefert den höchsten erreichten, nicht den nächsten", () => {
    expect(highestMilestone(7, [1, 5, 10])).toBe(5);
    expect(highestMilestone(10, [1, 5, 10])).toBe(10);
    expect(highestMilestone(999, [1, 5, 10])).toBe(10);
  });
});

describe("featuredMilestone", () => {
  // Dieser Text landet auf dem Teilen-Bild (lib/shareImage.ts) und damit auf
  // dem, was ein Nicht-Nutzer als erstes von Strado sieht. Live stand dort
  // "1 Pässe befahren".
  it("schreibt die Einzahl bei genau einem Pass", () => {
    expect(featuredMilestone({ passCount: 1, hoehenmeter: 0, fahrtenCount: 1 })).toBe(
      "1 Pass befahren",
    );
  });

  it("schreibt die Mehrzahl ab zwei", () => {
    expect(featuredMilestone({ passCount: 5, hoehenmeter: 0, fahrtenCount: 0 })).toBe(
      "5 Pässe befahren",
    );
  });

  it("schreibt die Einzahl bei genau einer Fahrt", () => {
    expect(featuredMilestone({ passCount: 0, hoehenmeter: 0, fahrtenCount: 1 })).toBe("1 Fahrt");
  });

  it("schreibt die Mehrzahl bei mehreren Fahrten", () => {
    expect(featuredMilestone({ passCount: 0, hoehenmeter: 0, fahrtenCount: 10 })).toBe("10 Fahrten");
  });

  it("bevorzugt Pässe vor Höhenmetern vor Fahrten", () => {
    expect(featuredMilestone({ passCount: 1, hoehenmeter: 50000, fahrtenCount: 100 })).toBe(
      "1 Pass befahren",
    );
    expect(featuredMilestone({ passCount: 0, hoehenmeter: 1000, fahrtenCount: 100 })).toBe(
      "1'000 Höhenmeter",
    );
  });

  it("liefert null, wenn noch kein Meilenstein erreicht ist", () => {
    expect(featuredMilestone({ passCount: 0, hoehenmeter: 0, fahrtenCount: 0 })).toBeNull();
  });

  // Der Grund, warum die Einzahl hier überhaupt vorkommt: beide Reihen
  // beginnen bei 1, die allererste Auszeichnung ist also der Einzahlfall.
  it("beginnt bei Pässen und Fahrten jeweils bei eins", () => {
    expect(PASS_MILESTONES[0]).toBe(1);
    expect(FAHRTEN_MILESTONES[0]).toBe(1);
  });
});
