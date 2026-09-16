import { describe, expect, it } from "vitest";
import { balkenHoehe } from "./balken";

// Diese Fälle standen bis zum Umzug der Funktion in
// lib/creatorKennzahlen.test.ts. Sie gehören hierher, weil sonst die
// einzige Abdeckung an einem Re-Export hinge, den es inzwischen bewusst
// nicht mehr gibt.
describe("balkenHoehe", () => {
  it("skaliert auf den Höchstwert", () => {
    expect(balkenHoehe(50, 100)).toBe(50);
    expect(balkenHoehe(100, 100)).toBe(100);
  });

  // Ein einzelner Klick neben einem Ausreisser wäre sonst optisch dasselbe
  // wie ein Tag ohne jeden Klick. Die Untergrenze muss dafür über dem
  // 2-px-Strich liegen, mit dem ein leerer Tag gezeichnet wird. Geprüft
  // gegen BEIDE Bahnen, die es gibt: 48 px im Klickverlauf (h-12) und
  // 40 px in der Saisonkurve (h-10). Die alten 4 % ergaben auf der
  // kürzeren 1.6 px und lagen damit unter "gar nichts".
  it("hält einen Wert mit Bewegung auf jeder Bahn sichtbar", () => {
    expect(balkenHoehe(1, 500)).toBe(10);
    expect(balkenHoehe(1, 500) * 0.48).toBeGreaterThan(2);
    expect(balkenHoehe(1, 500) * 0.4).toBeGreaterThan(2);
  });

  it("lässt einen leeren Wert leer", () => {
    expect(balkenHoehe(0, 500)).toBe(0);
    expect(balkenHoehe(0, 0)).toBe(0);
    expect(balkenHoehe(3, 0)).toBe(0);
  });

  // Ein negativer Höchstwert kann aus den heutigen Aufrufstellen nicht
  // kommen; die Funktion antwortet trotzdem mit 0 statt mit einem
  // negativen Prozentwert, der als CSS-Höhe stillschweigend ignoriert
  // würde.
  it("weist unbrauchbare Bezugsgrössen ab", () => {
    expect(balkenHoehe(5, -10)).toBe(0);
    expect(balkenHoehe(-5, 10)).toBe(0);
  });
});
