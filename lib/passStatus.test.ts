import { describe, expect, it } from "vitest";
import {
  istPassStrecke,
  istVeraltet,
  passStatusAnzeige,
  pruefDatum,
  pruefePassStatusEingabe,
  PASS_HINWEIS_MAX,
  type PassStatus,
} from "@/lib/passStatus";

// Mittag in Zürich, damit keine Zeitzonengrenze die Erwartungen verschiebt.
const JETZT = new Date("2026-09-17T10:00:00Z");

function status(teil: Partial<PassStatus>): PassStatus {
  return {
    route_id: "r1",
    status: "offen",
    voraussichtlich_offen_ab: null,
    hinweis: null,
    quelle: null,
    geprueft_am: "2026-09-12T08:00:00Z",
    ...teil,
  };
}

describe("istPassStrecke", () => {
  it("erkennt die Kategorie passstrasse", () => {
    expect(istPassStrecke(["kurvig", "passstrasse"])).toBe(true);
    expect(istPassStrecke(["kurvig", "scenic"])).toBe(false);
    expect(istPassStrecke([])).toBe(false);
  });
});

describe("pruefDatum", () => {
  it("lässt das Jahr im laufenden Jahr weg", () => {
    expect(pruefDatum("2026-09-12T08:00:00Z", JETZT)).toBe("12.09.");
  });

  it("nennt das Jahr, wenn die Prüfung aus einem anderen stammt", () => {
    expect(pruefDatum("2025-10-02T08:00:00Z", JETZT)).toBe("02.10.2025");
  });

  it("rechnet in Zürcher Zeit, nicht in UTC", () => {
    // 23:30 UTC am 11.09. ist in Zürich (CEST) bereits der 12.09.
    expect(pruefDatum("2026-09-11T23:30:00Z", JETZT)).toBe("12.09.");
  });
});

describe("istVeraltet", () => {
  it("gilt bis sieben Tage als aktuell", () => {
    expect(istVeraltet("2026-09-10T11:00:00Z", JETZT)).toBe(false);
  });

  it("gilt danach als veraltet", () => {
    expect(istVeraltet("2026-09-09T09:00:00Z", JETZT)).toBe(true);
  });
});

describe("passStatusAnzeige", () => {
  it("zeigt einen offenen Pass mit Prüfdatum", () => {
    expect(passStatusAnzeige(status({}), JETZT)).toEqual({
      wert: "offen",
      label: "Offen",
      zusatz: null,
      geprueft: "geprüft am 12.09.",
      veraltet: false,
    });
  });

  it("nennt die voraussichtliche Öffnung bei Wintersperre", () => {
    const anzeige = passStatusAnzeige(
      status({ status: "wintersperre", voraussichtlich_offen_ab: "2027-06-15" }),
      JETZT,
    );
    expect(anzeige.label).toBe("Wintersperre");
    expect(anzeige.zusatz).toBe("voraussichtlich offen ab 15. Juni 2027");
  });

  it("lässt das Jahr weg, wenn die Öffnung im laufenden Jahr liegt", () => {
    const anzeige = passStatusAnzeige(
      status({ status: "gesperrt", voraussichtlich_offen_ab: "2026-09-20" }),
      JETZT,
    );
    expect(anzeige.zusatz).toBe("voraussichtlich offen ab 20. September");
  });

  it("verschweigt eine verstrichene Schätzung", () => {
    const anzeige = passStatusAnzeige(
      status({ status: "gesperrt", voraussichtlich_offen_ab: "2026-06-01" }),
      JETZT,
    );
    expect(anzeige.zusatz).toBeNull();
  });

  it("zeigt eine Schätzung für heute noch", () => {
    const anzeige = passStatusAnzeige(
      status({ status: "gesperrt", voraussichtlich_offen_ab: "2026-09-17" }),
      JETZT,
    );
    expect(anzeige.zusatz).toBe("voraussichtlich offen ab 17. September");
  });

  it("markiert eine alte Prüfung als veraltet", () => {
    const anzeige = passStatusAnzeige(status({ geprueft_am: "2026-08-01T08:00:00Z" }), JETZT);
    expect(anzeige.veraltet).toBe(true);
    expect(anzeige.geprueft).toBe("geprüft am 01.08.");
  });
});

describe("pruefePassStatusEingabe", () => {
  const leer = { voraussichtlich_offen_ab: "", hinweis: "", quelle: "" };

  it("nimmt einen gültigen Status an und macht leere Felder zu null", () => {
    expect(pruefePassStatusEingabe({ status: "gesperrt", ...leer })).toEqual({
      ok: true,
      werte: { status: "gesperrt", voraussichtlich_offen_ab: null, hinweis: null, quelle: null },
    });
  });

  it("weist einen unbekannten Status ab", () => {
    const ergebnis = pruefePassStatusEingabe({ status: "halb offen", ...leer });
    expect(ergebnis.ok).toBe(false);
  });

  it("weist einen fehlenden Status ab", () => {
    expect(pruefePassStatusEingabe({ status: null, ...leer }).ok).toBe(false);
  });

  it("trimmt Hinweis und Quelle", () => {
    const ergebnis = pruefePassStatusEingabe({
      status: "offen",
      voraussichtlich_offen_ab: "",
      hinweis: "  Nachtsperre 22–6 Uhr ",
      quelle: " TCS ",
    });
    expect(ergebnis).toEqual({
      ok: true,
      werte: {
        status: "offen",
        voraussichtlich_offen_ab: null,
        hinweis: "Nachtsperre 22–6 Uhr",
        quelle: "TCS",
      },
    });
  });

  it("weist einen zu langen Hinweis ab", () => {
    const ergebnis = pruefePassStatusEingabe({
      status: "offen",
      voraussichtlich_offen_ab: "",
      hinweis: "x".repeat(PASS_HINWEIS_MAX + 1),
      quelle: "",
    });
    expect(ergebnis.ok).toBe(false);
  });

  it("weist ein ungültiges Datum ab", () => {
    for (const datum of ["2027-02-30", "15.06.2027", "morgen"]) {
      const ergebnis = pruefePassStatusEingabe({
        status: "wintersperre",
        voraussichtlich_offen_ab: datum,
        hinweis: "",
        quelle: "",
      });
      expect(ergebnis.ok, datum).toBe(false);
    }
  });

  it("übernimmt das Datum bei geschlossenem Pass", () => {
    const ergebnis = pruefePassStatusEingabe({
      status: "wintersperre",
      voraussichtlich_offen_ab: "2027-06-15",
      hinweis: "",
      quelle: "",
    });
    expect(ergebnis.ok && ergebnis.werte.voraussichtlich_offen_ab).toBe("2027-06-15");
  });

  it("verwirft das Datum bei offenem Pass, statt abzulehnen", () => {
    const ergebnis = pruefePassStatusEingabe({
      status: "offen",
      voraussichtlich_offen_ab: "2027-06-15",
      hinweis: "",
      quelle: "",
    });
    expect(ergebnis.ok && ergebnis.werte.voraussichtlich_offen_ab).toBeNull();
  });
});
