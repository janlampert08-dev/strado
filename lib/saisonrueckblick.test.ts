import { describe, expect, it } from "vitest";
import {
  istSaisonLeer,
  saisonAuswerten,
  waehleSaisonJahr,
  type SaisonFahrt,
} from "./saisonrueckblick";

const paesse = [
  { id: "klausen", name: "Klausenpass", hoehe_m: 1948 },
  { id: "pragel", name: "Pragelpass", hoehe_m: 1550 },
];

function fahrt(
  datum: string,
  route_id: string | null,
  streckenName: string | null = null,
  km = 50,
  hm = 800,
): SaisonFahrt {
  return { datum, route_id, streckenName, distanz_km: km, hoehenmeter_aufstieg: hm };
}

// In den Tests führt jede Strecke mit dem Kürzel eines Passes über diesen
// Pass — so wie meine_passfahrten() (0113) es aus dem Track erkennen würde.
function passFahrtenAus(fahrten: SaisonFahrt[]) {
  const kuerzel = new Set(paesse.map((p) => p.id));
  return fahrten
    .filter((f) => f.route_id !== null && kuerzel.has(f.route_id))
    .map((f) => ({ pass_id: f.route_id as string, datum: f.datum }));
}

function auswerten(fahrten: SaisonFahrt[], jahr: number) {
  return saisonAuswerten(fahrten, paesse, passFahrtenAus(fahrten), jahr);
}

describe("waehleSaisonJahr", () => {
  it("nimmt das laufende Jahr, wenn es Fahrten hat", () => {
    expect(waehleSaisonJahr(["2025-07-01", "2026-06-01"], "2026-09-17")).toBe(2026);
  });

  // Der Jahreswechsel: im Januar ist das neue Jahr leer, und gerade dann
  // will man die vergangene Saison teilen.
  it("fällt im leeren neuen Jahr auf das Vorjahr zurück", () => {
    expect(waehleSaisonJahr(["2026-08-01"], "2027-01-04")).toBe(2026);
  });

  it("greift nicht weiter zurück als ein Jahr", () => {
    expect(waehleSaisonJahr(["2024-08-01"], "2026-09-17")).toBeNull();
  });

  it("liefert null ohne Fahrten", () => {
    expect(waehleSaisonJahr([], "2026-09-17")).toBeNull();
  });
});

describe("saisonAuswerten", () => {
  it("summiert nur das gewählte Jahr und rundet auf ganze Werte", () => {
    const saison = auswerten(
      [
        fahrt("2026-06-01", "klausen", "Klausenpass", 40.4, 900.6),
        fahrt("2026-07-01", null, null, 10.4, 100),
        fahrt("2025-07-01", "pragel", "Pragelpass", 999, 999),
      ],
      2026,
    );
    expect(saison).toMatchObject({ jahr: 2026, fahrten: 2, km: 51, hoehenmeter: 1001, paesse: 1 });
  });

  it("stellt Pässe in der Reihenfolge der Saison voran, unabhängig von der Abfragesortierung", () => {
    const saison = auswerten(
      [
        fahrt("2026-08-01", "klausen", "Klausenpass"),
        fahrt("2026-06-01", "pragel", "Pragelpass"),
        fahrt("2026-07-01", "zuerich-runde", "Pfannenstiel"),
      ],
      2026,
    );
    expect(saison.ortArt).toBe("paesse");
    expect(saison.orte).toEqual([
      { name: "Pragelpass", hoehe_m: 1550 },
      { name: "Klausenpass", hoehe_m: 1948 },
    ]);
  });

  // Der Grund für 0113: eine freie Fahrt über den Klausen ist eine
  // Passfahrt, obwohl sie keine Strecke trägt.
  it("zählt eine freie Fahrt über einen Pass als Pass der Saison", () => {
    const saison = saisonAuswerten(
      [fahrt("2026-07-04", null)],
      paesse,
      [{ pass_id: "klausen", datum: "2026-07-04" }],
      2026,
    );
    expect(saison.paesse).toBe(1);
    expect(saison.orte).toEqual([{ name: "Klausenpass", hoehe_m: 1948 }]);
  });

  it("zeigt ohne Pass die gefahrenen Strecken als Orte", () => {
    const saison = auswerten(
      [fahrt("2026-06-01", "runde", "Pfannenstiel"), fahrt("2026-06-02", null)],
      2026,
    );
    expect(saison.ortArt).toBe("strecken");
    expect(saison.orte).toEqual([{ name: "Pfannenstiel", hoehe_m: null }]);
  });

  it("nennt die meistgefahrene Strecke erst ab zwei Fahrten", () => {
    const einmal = auswerten(
      [fahrt("2026-06-01", "klausen", "Klausenpass"), fahrt("2026-06-02", "pragel", "Pragelpass")],
      2026,
    );
    expect(einmal.meistgefahren).toBeNull();

    const oft = auswerten(
      [
        fahrt("2026-06-01", "pragel", "Pragelpass"),
        fahrt("2026-06-02", "klausen", "Klausenpass"),
        fahrt("2026-06-03", "klausen", "Klausenpass"),
      ],
      2026,
    );
    expect(oft.meistgefahren).toEqual({ name: "Klausenpass", anzahl: 2 });
  });

  it("entscheidet einen Gleichstand für die früher gefahrene Strecke", () => {
    const saison = auswerten(
      [
        fahrt("2026-08-01", "klausen", "Klausenpass"),
        fahrt("2026-05-01", "pragel", "Pragelpass"),
        fahrt("2026-08-02", "klausen", "Klausenpass"),
        fahrt("2026-05-02", "pragel", "Pragelpass"),
      ],
      2026,
    );
    expect(saison.meistgefahren?.name).toBe("Pragelpass");
  });

  it("verteilt die Fahrten auf zwölf Monate", () => {
    const saison = auswerten(
      [fahrt("2026-06-01", null), fahrt("2026-06-20", null), fahrt("2026-10-01", null)],
      2026,
    );
    expect(saison.proMonat).toHaveLength(12);
    expect(saison.proMonat[5]).toBe(2);
    expect(saison.proMonat[9]).toBe(1);
  });

  it("ergibt für ein Jahr ohne Fahrten eine leere Saison", () => {
    const saison = auswerten([fahrt("2025-06-01", "klausen", "Klausenpass")], 2026);
    expect(saison.fahrten).toBe(0);
    expect(saison.orte).toEqual([]);
    expect(istSaisonLeer(saison)).toBe(true);
    expect(istSaisonLeer(null)).toBe(true);
  });
});
