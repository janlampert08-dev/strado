import { describe, expect, it } from "vitest";
import {
  fahrtenProFahrzeug,
  fahrtenProJahr,
  fahrtenProRegion,
  jahrAus,
  monatAus,
  monatsWerte,
  rekorde,
  saisonVergleich,
  streckenBilanz,
  tagImJahrAus,
  type FahrtFuerStatistik,
} from "./fahrtstatistik";

function fahrt(
  datum: string,
  km: number | null = 10,
  hm: number | null = 100,
  fahrzeug: string | null = "auto-1",
  route: string | null = null,
  region: string | null = null,
): FahrtFuerStatistik {
  return {
    datum,
    distanz_km: km,
    hoehenmeter_aufstieg: hm,
    fahrzeug_id: fahrzeug,
    route_id: route,
    region,
  };
}

describe("jahrAus / monatAus", () => {
  it("zerlegt ein DATE ohne Zeitzonenumweg", () => {
    expect(jahrAus("2026-01-01")).toBe(2026);
    expect(monatAus("2026-01-01")).toBe(1);
    expect(monatAus("2026-12-31")).toBe(12);
  });

  // Der eigentliche Grund für die Zeichenketten-Zerlegung: new Date() würde
  // "2026-01-01" als UTC-Mitternacht lesen und in jeder westlichen Zone das
  // Vorjahr liefern. Dieser Test hält fest, dass wir das NICHT tun.
  it("ordnet den 1. Januar dem laufenden Jahr zu, nicht dem Vorjahr", () => {
    const zeilen = fahrtenProJahr([fahrt("2026-01-01")]);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].jahr).toBe(2026);
  });

  it("weist unbrauchbare Datumsangaben ab, statt sie zu raten", () => {
    expect(jahrAus("2026-1-1")).toBeNull();
    expect(jahrAus("")).toBeNull();
    expect(jahrAus("gestern")).toBeNull();
    expect(monatAus("2026-13-01")).toBeNull();
    expect(monatAus("2026-00-01")).toBeNull();
  });
});

describe("fahrtenProJahr", () => {
  it("fasst je Jahr zusammen und sortiert neuestes zuerst", () => {
    const zeilen = fahrtenProJahr([
      fahrt("2024-05-01", 20, 200),
      fahrt("2026-06-01", 30, 300),
      fahrt("2026-07-01", 12, 150),
    ]);

    expect(zeilen.map((z) => z.jahr)).toEqual([2026, 2024]);
    expect(zeilen[0]).toMatchObject({ jahr: 2026, fahrten: 2, km: 42, hoehenmeter: 450 });
    expect(zeilen[1]).toMatchObject({ jahr: 2024, fahrten: 1, km: 20, hoehenmeter: 200 });
  });

  it("rundet Kilometer auf eine Stelle statt Gleitkommarauschen zu zeigen", () => {
    const zeilen = fahrtenProJahr([
      fahrt("2026-01-02", 0.1, 0),
      fahrt("2026-01-03", 0.2, 0),
    ]);
    expect(zeilen[0].km).toBe(0.3);
  });

  it("zählt fehlende Messwerte als null und nicht als NaN", () => {
    const zeilen = fahrtenProJahr([fahrt("2026-01-02", null, null)]);
    expect(zeilen[0]).toMatchObject({ fahrten: 1, km: 0, hoehenmeter: 0 });
  });

  it("sortiert neueste Jahre zuerst", () => {
    const zeilen = fahrtenProJahr([
      fahrt("2025-05-01", 100, 0),
      fahrt("2026-05-01", 130, 0),
    ]);
    expect(zeilen.map((z) => z.jahr)).toEqual([2026, 2025]);
  });

  it("erfindet keine Nullzeilen für Jahre ohne Fahrt", () => {
    const zeilen = fahrtenProJahr([fahrt("2020-05-01"), fahrt("2026-05-01")]);
    expect(zeilen).toHaveLength(2);
  });

  it("liefert eine leere Liste für eine leere Eingabe", () => {
    expect(fahrtenProJahr([])).toEqual([]);
  });
});

describe("fahrtenProFahrzeug", () => {
  it("sortiert nach Kilometern absteigend", () => {
    const zeilen = fahrtenProFahrzeug([
      fahrt("2026-05-01", 10, 0, "toeff"),
      fahrt("2026-05-02", 90, 0, "auto"),
    ]);
    expect(zeilen.map((z) => z.fahrzeugId)).toEqual(["auto", "toeff"]);
  });

  it("hält Fahrten ohne Fahrzeug als eigene Zeile am Ende", () => {
    const zeilen = fahrtenProFahrzeug([
      fahrt("2026-05-01", 500, 0, null),
      fahrt("2026-05-02", 10, 0, "auto"),
    ]);
    // Trotz der grösseren Kilometerzahl steht die Zeile ohne Zuordnung
    // hinten — sie ist ein Sammelposten, kein Fahrzeug.
    expect(zeilen.map((z) => z.fahrzeugId)).toEqual(["auto", null]);
  });

  it("summiert sich auf dieselbe Gesamtzahl wie die Jahresansicht", () => {
    const eingabe = [
      fahrt("2025-05-01", 12.5, 120, "auto"),
      fahrt("2026-05-02", 7.5, 80, null),
      fahrt("2026-05-03", 30, 200, "toeff"),
    ];
    const proFahrzeug = fahrtenProFahrzeug(eingabe);
    const jahre = fahrtenProJahr(eingabe);

    const kmFahrzeug = proFahrzeug.reduce((s, z) => s + z.km, 0);
    const kmJahre = jahre.reduce((s, z) => s + z.km, 0);
    expect(Math.round(kmFahrzeug * 10) / 10).toBe(Math.round(kmJahre * 10) / 10);

    const fahrtenFahrzeug = proFahrzeug.reduce((s, z) => s + z.fahrten, 0);
    expect(fahrtenFahrzeug).toBe(eingabe.length);
  });

  it("liefert eine leere Liste für eine leere Eingabe", () => {
    expect(fahrtenProFahrzeug([])).toEqual([]);
  });
});

describe("monatsWerte", () => {
  it("liefert zwölf Zeilen, Index 0 ist Januar", () => {
    const monate = monatsWerte([fahrt("2026-01-15"), fahrt("2026-12-24")], 2026);
    expect(monate).toHaveLength(12);
    expect(monate[0].fahrten).toBe(1);
    expect(monate[11].fahrten).toBe(1);
  });

  // Der eigentliche Grund für den Wechsel von der blossen Anzahl auf die
  // ganze Zeile: eine Feierabendrunde und eine Alpentour zählen gleich viel,
  // die Kilometer nicht.
  it("führt Kilometer und Höhenmeter je Monat, nicht nur die Anzahl", () => {
    const monate = monatsWerte(
      [fahrt("2026-07-01", 12, 300), fahrt("2026-07-20", 240, 4200)],
      2026,
    );
    expect(monate[6]).toEqual({ fahrten: 2, km: 252, hoehenmeter: 4500 });
  });

  it("behält die Nullen — die Winterpause ist der Inhalt", () => {
    const monate = monatsWerte([fahrt("2026-07-01"), fahrt("2026-07-02")], 2026);
    expect(monate.map((m) => m.fahrten)).toEqual([0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
  });

  it("ignoriert Fahrten aus anderen Jahren", () => {
    const monate = monatsWerte([fahrt("2025-07-01"), fahrt("2026-07-01")], 2026);
    expect(monate[6].fahrten).toBe(1);
  });

  it("ignoriert unbrauchbare Datumsangaben", () => {
    const monate = monatsWerte([{ ...fahrt("2026-07-01"), datum: "kaputt" }], 2026);
    expect(monate.every((m) => m.fahrten === 0)).toBe(true);
  });
});

describe("tagImJahrAus", () => {
  it("liefert MM-TT als vergleichbare Zeichenkette", () => {
    expect(tagImJahrAus("2026-09-16")).toBe("09-16");
    // Lexikografisch, ohne dass irgendwo ein Date und damit eine Zeitzone
    // entsteht — genau darauf baut saisonVergleich().
    expect(tagImJahrAus("2026-02-03")! < tagImJahrAus("2026-11-01")!).toBe(true);
  });

  it("weist unbrauchbare Datumsangaben ab", () => {
    expect(tagImJahrAus("2026-13-01")).toBeNull();
    expect(tagImJahrAus("gestern")).toBeNull();
  });
});

describe("saisonVergleich", () => {
  // Der Kern der Sache: ein angefangenes Jahr darf nicht gegen ein volles
  // stehen. Im September 2026 zählen vom Vorjahr nur die Fahrten bis zum
  // 16. September mit.
  it("vergleicht nur denselben Zeitraum, solange das Jahr läuft", () => {
    const eingabe = [
      fahrt("2025-05-01", 100, 0),
      fahrt("2025-11-01", 900, 0), // liegt nach dem Stichtag
      fahrt("2026-05-01", 130, 0),
    ];
    const s = saisonVergleich(eingabe, 2026, "2026-09-16");
    expect(s.laufend).toBe(true);
    expect(s.bisTag).toBe("09-16");
    expect(s.aktuell.km).toBe(130);
    expect(s.vorjahr?.km).toBe(100);
  });

  it("vergleicht volle Jahre, wenn die Saison abgeschlossen ist", () => {
    const eingabe = [fahrt("2024-11-01", 900, 0), fahrt("2025-11-01", 100, 0)];
    const s = saisonVergleich(eingabe, 2025, "2026-09-16");
    expect(s.laufend).toBe(false);
    expect(s.bisTag).toBe("12-31");
    expect(s.aktuell.km).toBe(100);
    expect(s.vorjahr?.km).toBe(900);
  });

  it("lässt den Vergleich weg, wenn das Vorjahr gar keine Fahrt hat", () => {
    const s = saisonVergleich([fahrt("2026-05-01", 130, 0)], 2026, "2026-09-16");
    // Eine Lücke ist kein Rückgang auf null.
    expect(s.vorjahr).toBeNull();
  });

  it("zeigt eine Null, wenn im Vorjahr erst nach dem Stichtag gefahren wurde", () => {
    const s = saisonVergleich(
      [fahrt("2025-11-01", 900, 0), fahrt("2026-05-01", 130, 0)],
      2026,
      "2026-09-16",
    );
    // Anders als die Lücke oben: das Vorjahr existiert, in diesem Fenster
    // steht nur nichts darin.
    expect(s.vorjahr).toEqual({ fahrten: 0, km: 0, hoehenmeter: 0 });
  });

  it("nimmt den Stichtag selbst mit", () => {
    const s = saisonVergleich([fahrt("2026-09-16", 42, 0)], 2026, "2026-09-16");
    expect(s.aktuell.fahrten).toBe(1);
  });

  it("fällt auf den vollen Jahresvergleich zurück, wenn heute unlesbar ist", () => {
    const s = saisonVergleich([fahrt("2026-11-01", 42, 0)], 2026, "kaputt");
    expect(s.laufend).toBe(false);
    expect(s.aktuell.km).toBe(42);
  });
});

describe("fahrtenProRegion", () => {
  it("sortiert nach Kilometern und hängt Fahrten ohne Region hinten an", () => {
    const zeilen = fahrtenProRegion([
      fahrt("2026-05-01", 500, 0, "auto", null, null),
      fahrt("2026-05-02", 10, 0, "auto", null, "Jura"),
      fahrt("2026-05-03", 80, 0, "auto", null, "Graubünden"),
    ]);
    expect(zeilen.map((z) => z.region)).toEqual(["Graubünden", "Jura", null]);
  });

  it("behandelt einen leeren String wie eine fehlende Region", () => {
    const zeilen = fahrtenProRegion([
      fahrt("2026-05-01", 10, 0, "auto", null, "   "),
      fahrt("2026-05-02", 10, 0, "auto", null, null),
    ]);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].region).toBeNull();
    expect(zeilen[0].fahrten).toBe(2);
  });

  it("summiert sich auf dieselbe Gesamtzahl wie die Jahresansicht", () => {
    const eingabe = [
      fahrt("2025-05-01", 12.5, 120, "auto", null, "Tessin"),
      fahrt("2026-05-02", 7.5, 80, null, null, null),
      fahrt("2026-05-03", 30, 200, "toeff", null, "Wallis"),
    ];
    const kmRegion = fahrtenProRegion(eingabe).reduce((s, z) => s + z.km, 0);
    const kmJahre = fahrtenProJahr(eingabe).reduce((s, z) => s + z.km, 0);
    expect(Math.round(kmRegion * 10) / 10).toBe(Math.round(kmJahre * 10) / 10);
  });
});

describe("streckenBilanz", () => {
  it("zählt eine Strecke nur im Jahr ihrer ERSTEN Befahrung als neu", () => {
    const eingabe = [
      fahrt("2026-05-01", 10, 0, "auto", "klausen"),
      fahrt("2025-05-01", 10, 0, "auto", "klausen"),
      fahrt("2026-06-01", 10, 0, "auto", "susten"),
    ];
    expect(streckenBilanz(eingabe, 2026)).toEqual({ neuImJahr: 1, gesamt: 2 });
    expect(streckenBilanz(eingabe, 2025)).toEqual({ neuImJahr: 1, gesamt: 2 });
  });

  it("lässt freie Fahrten aussen vor — sie haben keine Strecke", () => {
    expect(streckenBilanz([fahrt("2026-05-01", 10, 0, "auto", null)], 2026)).toEqual({
      neuImJahr: 0,
      gesamt: 0,
    });
  });
});

describe("rekorde", () => {
  it("findet die längste Fahrt und den grössten Anstieg mit ihrem Datum", () => {
    const werte = rekorde([
      fahrt("2026-05-01", 120, 900),
      fahrt("2026-06-01", 40, 2400),
    ]);
    expect(werte.laengsteFahrt).toEqual({ wert: 120, datum: "2026-05-01" });
    expect(werte.hoechsterAnstieg).toEqual({ wert: 2400, datum: "2026-06-01" });
  });

  it("summiert den stärksten Monat über alle Jahre", () => {
    const werte = rekorde([
      fahrt("2026-07-01", 100, 0),
      fahrt("2026-07-15", 150, 0),
      fahrt("2025-08-01", 200, 0),
    ]);
    expect(werte.staerksterMonat).toEqual({ jahr: 2026, monat: 7, km: 250 });
  });

  it("liefert null statt einer Null, wenn nichts gemessen wurde", () => {
    const werte = rekorde([fahrt("2026-05-01", null, null)]);
    expect(werte.laengsteFahrt).toBeNull();
    expect(werte.hoechsterAnstieg).toBeNull();
    expect(werte.staerksterMonat).toBeNull();
  });

  it("liefert für eine leere Eingabe überall null", () => {
    expect(rekorde([])).toEqual({
      laengsteFahrt: null,
      hoechsterAnstieg: null,
      staerksterMonat: null,
    });
  });
});
