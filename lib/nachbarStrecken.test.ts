import { describe, expect, it } from "vitest";
import { waehleNachbarStrecken } from "@/lib/nachbarStrecken";

// Startpunkte grob nach echten Strecken (Innertkirchen, Gletsch, Andermatt …).
const susten = { id: "susten", region: "Kanton Bern", start: [8.23, 46.7] as [number, number] };
const grimsel = { id: "grimsel", region: "Kanton Bern", start: [8.19, 46.69] as [number, number] };
const furka = { id: "furka", region: "Kanton Wallis", start: [8.36, 46.57] as [number, number] };
const oberalp = { id: "oberalp", region: "Kanton Uri", start: [8.59, 46.63] as [number, number] };
const jaun = { id: "jaun", region: "Kanton Bern", start: [7.28, 46.61] as [number, number] };
const albis = { id: "albis", region: "Kanton Zürich", start: [8.52, 47.28] as [number, number] };
const genf = { id: "genf", region: "Kanton Genf", start: [6.14, 46.2] as [number, number] };

describe("waehleNachbarStrecken", () => {
  it("nimmt die nächsten Startpunkte im Umkreis, ohne die Strecke selbst", () => {
    const ergebnis = waehleNachbarStrecken([susten, grimsel, furka, oberalp, albis, genf], susten);
    expect(ergebnis.map((e) => e.strecke.id)).toEqual(["grimsel", "furka", "oberalp"]);
    expect(ergebnis[0].distanzKm).toBeLessThan(5);
  });

  it("begrenzt auf das Maximum", () => {
    const viele = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      region: "Kanton Bern",
      start: [8.23 + i * 0.01, 46.7] as [number, number],
    }));
    expect(waehleNachbarStrecken([susten, ...viele], susten)).toHaveLength(6);
  });

  it("füllt zuerst aus derselben Region auf, dann mit den nächsten", () => {
    // Im 60-km-Umkreis von Jaun liegt nichts. Auffüllen: zuerst die beiden
    // Berner Strecken, dann die nächste übrige (Furka, rund 85 km — näher
    // als Genf).
    const ergebnis = waehleNachbarStrecken([susten, grimsel, furka, albis, genf, jaun], jaun);
    expect(ergebnis).toHaveLength(3);
    expect(ergebnis.map((e) => e.strecke.id).sort()).toEqual(["furka", "grimsel", "susten"].sort());
    // Nach Distanz sortiert, auch die aufgefüllten.
    const distanzen = ergebnis.map((e) => e.distanzKm);
    expect([...distanzen].sort((a, b) => a - b)).toEqual(distanzen);
  });

  it("gibt eine leere Liste, wenn es sonst nichts gibt", () => {
    expect(waehleNachbarStrecken([susten], susten)).toEqual([]);
  });
});
