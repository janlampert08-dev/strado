import { describe, expect, it } from "vitest";
import {
  formatiereZeitraum,
  heuteCH,
  oeffnungenAusEreignissen,
  offenSeitText,
  saisonMonate,
  teileSperrtage,
  wintersperreText,
  type PassEreignis,
  type Sperrtag,
} from "@/lib/passKalender";

function sperrtag(teil: Partial<Sperrtag> & { id: string; von: string; bis: string }): Sperrtag {
  return {
    passId: "susten",
    art: "autofrei",
    titel: "FreiPass",
    zeitfenster: null,
    quelleUrl: null,
    ...teil,
  };
}

describe("wintersperreText", () => {
  it("nennt die üblichen Monate", () => {
    expect(wintersperreText(10, 5)).toBe("Wintersperre üblich von Oktober bis Mai");
  });

  it("schweigt für einen ganzjährig offenen Pass", () => {
    expect(wintersperreText(null, null)).toBeNull();
  });
});

describe("saisonMonate", () => {
  it("markiert die offenen Monate einer Spanne über den Jahreswechsel", () => {
    const monate = saisonMonate(10, 5);
    // Juni bis September offen, Oktober bis Mai zu.
    expect(monate).toEqual([
      false, false, false, false, false, true,
      true, true, true, false, false, false,
    ]);
  });

  it("gibt einem ganzjährigen Pass zwölf offene Monate", () => {
    expect(saisonMonate(null, null).every(Boolean)).toBe(true);
  });
});

describe("teileSperrtage", () => {
  const tage = [
    sperrtag({ id: "a", von: "2026-06-07", bis: "2026-06-07" }),
    sperrtag({ id: "b", von: "2026-09-20", bis: "2026-09-20" }),
    sperrtag({ id: "c", von: "2026-09-17", bis: "2026-09-18" }),
  ];

  it("trennt nach heute und sortiert beide Seiten zum Lesen", () => {
    const { kommend, vergangen } = teileSperrtage(tage, "2026-09-17");
    // Der heute laufende Zeitraum zählt als kommend.
    expect(kommend.map((s) => s.id)).toEqual(["c", "b"]);
    expect(vergangen.map((s) => s.id)).toEqual(["a"]);
  });

  it("kennt keine kommenden, wenn alles vorbei ist", () => {
    expect(teileSperrtage(tage, "2027-01-01").kommend).toEqual([]);
  });
});

describe("formatiereZeitraum", () => {
  it("formatiert einen einzelnen Tag", () => {
    expect(formatiereZeitraum("2026-06-07", "2026-06-07")).toBe("7. Juni 2026");
  });

  it("fasst Tage im selben Monat zusammen", () => {
    expect(formatiereZeitraum("2026-06-07", "2026-06-09")).toBe("7.–9. Juni 2026");
  });

  it("schreibt über Monats- und Jahresgrenzen aus", () => {
    expect(formatiereZeitraum("2026-06-29", "2026-07-02")).toBe("29. Juni bis 2. Juli 2026");
    expect(formatiereZeitraum("2026-12-30", "2027-01-02")).toBe(
      "30. Dezember 2026 bis 2. Januar 2027",
    );
  });

  it("verschiebt den Tag nicht über die Zeitzone", () => {
    // Der klassische Fehler: new Date("2026-06-07") ist Mitternacht UTC und
    // damit in der Schweiz bereits der 7. um 02:00 — aber im Winter der 6.
    expect(formatiereZeitraum("2026-01-01", "2026-01-01")).toBe("1. Januar 2026");
  });
});

describe("heuteCH", () => {
  it("nimmt den Schweizer Kalendertag, nicht den UTC-Tag", () => {
    // 31.12.2026 23:30 UTC ist in Zürich schon der 1.1.2027.
    expect(heuteCH(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("oeffnungenAusEreignissen", () => {
  const ereignisse: PassEreignis[] = [
    { zustand: "offen", vorher: "wintersperre", erfasstAm: "2026-05-28T09:12:00Z" },
    { zustand: "gesperrt", vorher: "offen", erfasstAm: "2026-07-02T12:00:00Z" },
    { zustand: "offen", vorher: "gesperrt", erfasstAm: "2026-07-03T12:00:00Z" },
    { zustand: "offen", vorher: "wintersperre", erfasstAm: "2025-06-11T07:00:00Z" },
  ];

  it("nimmt je Jahr die Öffnung nach der Wintersperre", () => {
    expect(oeffnungenAusEreignissen(ereignisse)).toEqual([
      { jahr: 2026, datum: "2026-05-28" },
      { jahr: 2025, datum: "2025-06-11" },
    ]);
  });

  it("zählt eine Wiedereröffnung nach einem Felssturz nicht als Saisonöffnung", () => {
    const nurSperrung: PassEreignis[] = [
      { zustand: "offen", vorher: "gesperrt", erfasstAm: "2026-07-03T12:00:00Z" },
    ];
    expect(oeffnungenAusEreignissen(nurSperrung)).toEqual([]);
  });

  it("liefert im ersten Jahr eine leere Liste statt einer erfundenen Zeile", () => {
    expect(oeffnungenAusEreignissen([])).toEqual([]);
  });
});

describe("offenSeitText", () => {
  const ereignisse: PassEreignis[] = [
    { zustand: "offen", vorher: "wintersperre", erfasstAm: "2026-05-28T09:12:00Z" },
  ];

  it("nennt den Tag der Öffnung", () => {
    expect(offenSeitText("offen", "2026-05-28T09:12:00Z", ereignisse)).toBe(
      "Offen seit dem 28. Mai 2026",
    );
  });

  it("schweigt, solange der Pass nicht offen ist", () => {
    expect(offenSeitText("wintersperre", "2026-01-02T00:00:00Z", ereignisse)).toBeNull();
  });

  it("schweigt, wenn wir die Öffnung nie gesehen haben", () => {
    expect(offenSeitText("offen", "2026-05-28T09:12:00Z", [])).toBeNull();
  });
});
