import { describe, expect, it } from "vitest";
import {
  BALD_KM,
  BALD_TAGE,
  FAELLIG_KM,
  FAELLIG_TAGE,
  MAX_KM_STAND,
  MAX_NOTIZ_LAENGE,
  MFK_ERLEDIGT_FENSTER_TAGE,
  artenFuer,
  datumText,
  erinnerungenLeer,
  fahrtKmNach,
  frankenOderLeer,
  ganzeZahlOderLeer,
  juengsterEintrag,
  kmText,
  kurzhinweis,
  mfkErinnerung,
  plusMonate,
  pruefeEintrag,
  pruefeErinnerungen,
  relativeTage,
  schaetzeKmStand,
  schlimmsterStatus,
  serviceErinnerung,
  sortiereNeuesteZuerst,
  statusNachKm,
  statusNachTagen,
  tageZwischen,
  tagNummer,
  type EintragFuerBerechnung,
  type FahrtFuerBerechnung,
  type Wartungsart,
} from "./wartung";

const HEUTE = "2026-09-17";

function eintrag(
  art: Wartungsart,
  datum: string,
  km_stand: number | null = null,
  created_at = `${datum}T10:00:00Z`,
): EintragFuerBerechnung {
  return { art, datum, km_stand, created_at };
}

function fahrt(datum: string, distanz_km: number | null): FahrtFuerBerechnung {
  return { datum, distanz_km };
}

describe("Datumsrechnung", () => {
  it("lehnt unmögliche Daten ab, statt sie in den Folgemonat zu schieben", () => {
    expect(tagNummer("2026-02-30")).toBeNull();
    expect(tagNummer("2026-13-01")).toBeNull();
    expect(tagNummer("17.09.2026")).toBeNull();
    expect(tagNummer("2028-02-29")).not.toBeNull();
  });

  it("zählt Tage ohne Zeitzonenumweg", () => {
    expect(tageZwischen("2026-09-17", "2026-09-18")).toBe(1);
    expect(tageZwischen("2026-12-31", "2027-01-01")).toBe(1);
    // Umstellung auf Winterzeit dazwischen: bleibt ein ganzer Tag.
    expect(tageZwischen("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("kappt Monatsaddition auf das Monatsende", () => {
    expect(plusMonate("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMonate("2028-02-29", 12)).toBe("2029-02-28");
    expect(plusMonate("2026-09-17", 12)).toBe("2027-09-17");
    expect(plusMonate("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("fahrtKmNach", () => {
  it("zählt nur Fahrten strikt nach dem Datum", () => {
    const fahrten = [fahrt("2026-05-01", 100), fahrt("2026-05-02", 50), fahrt("2026-04-30", 999)];
    expect(fahrtKmNach(fahrten, "2026-05-01")).toBe(50);
  });

  it("zählt fehlende, negative und kaputte Distanzen nicht", () => {
    const fahrten = [
      fahrt("2026-06-01", null),
      fahrt("2026-06-01", -20),
      fahrt("2026-06-01", Number.NaN),
      fahrt("kaputt", 40),
      fahrt("2026-06-01", 12.5),
    ];
    expect(fahrtKmNach(fahrten, "2026-05-01")).toBe(12.5);
  });

  it("ist ohne Fahrten null", () => {
    expect(fahrtKmNach([], "2026-05-01")).toBe(0);
  });
});

describe("schaetzeKmStand", () => {
  it("ist null ohne einen einzigen Kilometerstand", () => {
    expect(schaetzeKmStand([], [fahrt("2026-06-01", 100)])).toBeNull();
    expect(schaetzeKmStand([eintrag("service", "2026-01-01")], [fahrt("2026-06-01", 100)])).toBeNull();
  });

  it("addiert die aufgezeichneten Fahrten nach dem Eintrag", () => {
    const s = schaetzeKmStand(
      [eintrag("service", "2026-03-01", 10_000)],
      [fahrt("2026-03-01", 500), fahrt("2026-04-01", 120.4), fahrt("2026-05-01", 80)],
    );
    expect(s).toEqual({
      mindestensKm: 10_200,
      ausgehendVonDatum: "2026-03-01",
      ausgehendVonKm: 10_000,
      aufgezeichnetKm: 200,
    });
  });

  it("nimmt die höchste Untergrenze, nicht blind den jüngsten Eintrag", () => {
    // Jüngster Eintrag vertippt (1 000 statt 11 000): der ältere trägt weiter.
    const s = schaetzeKmStand(
      [eintrag("service", "2026-01-01", 10_000), eintrag("pneuwechsel", "2026-04-01", 1_000)],
      [fahrt("2026-02-01", 300)],
    );
    expect(s?.mindestensKm).toBe(10_300);
    expect(s?.ausgehendVonDatum).toBe("2026-01-01");
  });

  it("nimmt den jüngeren Stand, wenn er höher ist als die ältere Schätzung", () => {
    const s = schaetzeKmStand(
      [eintrag("service", "2026-01-01", 10_000), eintrag("mfk", "2026-06-01", 14_000)],
      [fahrt("2026-02-01", 300), fahrt("2026-07-01", 50)],
    );
    expect(s?.mindestensKm).toBe(14_050);
  });
});

describe("juengsterEintrag / sortiereNeuesteZuerst", () => {
  it("findet den jüngsten Eintrag einer Art, bei gleichem Datum den zuletzt erfassten", () => {
    const a = eintrag("service", "2026-05-01", null, "2026-05-01T08:00:00Z");
    const b = eintrag("service", "2026-05-01", null, "2026-05-01T09:00:00Z");
    const c = eintrag("mfk", "2026-06-01");
    expect(juengsterEintrag([a, b, c], "service")).toBe(b);
    expect(juengsterEintrag([a, b, c], "batterie")).toBeNull();
  });

  it("sortiert neueste zuerst", () => {
    const a = eintrag("service", "2025-01-01");
    const b = eintrag("mfk", "2026-01-01", null, "2026-01-01T08:00:00Z");
    const c = eintrag("bremsen", "2026-01-01", null, "2026-01-01T09:00:00Z");
    expect(sortiereNeuesteZuerst([a, b, c])).toEqual([c, b, a]);
  });
});

describe("Schwellen", () => {
  it("nach Tagen, an den Grenzen", () => {
    expect(statusNachTagen(-1)).toBe("ueberfaellig");
    expect(statusNachTagen(0)).toBe("faellig");
    expect(statusNachTagen(FAELLIG_TAGE)).toBe("faellig");
    expect(statusNachTagen(FAELLIG_TAGE + 1)).toBe("bald");
    expect(statusNachTagen(BALD_TAGE)).toBe("bald");
    expect(statusNachTagen(BALD_TAGE + 1)).toBe("ok");
  });

  it("nach Kilometern, an den Grenzen", () => {
    expect(statusNachKm(-1)).toBe("ueberfaellig");
    expect(statusNachKm(0)).toBe("faellig");
    expect(statusNachKm(FAELLIG_KM)).toBe("faellig");
    expect(statusNachKm(FAELLIG_KM + 1)).toBe("bald");
    expect(statusNachKm(BALD_KM)).toBe("bald");
    expect(statusNachKm(BALD_KM + 1)).toBe("ok");
  });

  it("der schlimmere Status gewinnt", () => {
    expect(schlimmsterStatus("ok", "bald")).toBe("bald");
    expect(schlimmsterStatus("ueberfaellig", "faellig")).toBe("ueberfaellig");
    expect(schlimmsterStatus("ok", "ok")).toBe("ok");
  });
});

describe("mfkErinnerung", () => {
  it("ohne Einstellungen oder Termin: kein Termin", () => {
    expect(mfkErinnerung(null, [], HEUTE)).toEqual({ zustand: "kein_termin" });
    expect(
      mfkErinnerung(
        { naechste_mfk_am: null, service_intervall_km: 15_000, service_intervall_monate: null },
        [],
        HEUTE,
      ),
    ).toEqual({ zustand: "kein_termin" });
  });

  it("zählt die Tage bis zum Termin", () => {
    const e = mfkErinnerung(
      { naechste_mfk_am: "2026-10-08", service_intervall_km: null, service_intervall_monate: null },
      [],
      HEUTE,
    );
    expect(e).toEqual({ zustand: "offen", termin: "2026-10-08", tage: 21, status: "bald" });
  });

  it("ist überfällig ab dem Tag nach dem Termin", () => {
    const einst = { naechste_mfk_am: HEUTE, service_intervall_km: null, service_intervall_monate: null };
    expect(mfkErinnerung(einst, [], HEUTE)).toMatchObject({ status: "faellig", tage: 0 });
    expect(mfkErinnerung(einst, [], "2026-09-18")).toMatchObject({ status: "ueberfaellig", tage: -1 });
  });

  it("gilt als erledigt, wenn kurz vor oder nach dem Termin eine MFK eingetragen ist", () => {
    const einst = { naechste_mfk_am: "2026-10-01", service_intervall_km: null, service_intervall_monate: null };
    expect(mfkErinnerung(einst, [eintrag("mfk", "2026-09-10")], HEUTE)).toEqual({
      zustand: "erledigt",
      termin: "2026-10-01",
      erledigtAm: "2026-09-10",
    });
    // Nach dem Termin vorgeführt: ebenfalls erledigt, nicht überfällig.
    expect(mfkErinnerung(einst, [eintrag("mfk", "2026-10-05")], "2026-10-06")).toMatchObject({
      zustand: "erledigt",
    });
  });

  it("eine alte MFK erledigt den neuen Termin nicht", () => {
    const einst = { naechste_mfk_am: "2026-10-01", service_intervall_km: null, service_intervall_monate: null };
    // Genau an der Fenstergrenze noch erledigt, einen Tag davor nicht mehr.
    const amRand = new Date(Date.UTC(2026, 9, 1) - MFK_ERLEDIGT_FENSTER_TAGE * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const davor = new Date(Date.UTC(2026, 9, 1) - (MFK_ERLEDIGT_FENSTER_TAGE + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(mfkErinnerung(einst, [eintrag("mfk", amRand)], HEUTE).zustand).toBe("erledigt");
    expect(mfkErinnerung(einst, [eintrag("mfk", davor)], HEUTE).zustand).toBe("offen");
  });
});

describe("serviceErinnerung", () => {
  const nurKm = { naechste_mfk_am: null, service_intervall_km: 10_000, service_intervall_monate: null };
  const nurMonate = { naechste_mfk_am: null, service_intervall_km: null, service_intervall_monate: 12 };
  const beides = { naechste_mfk_am: null, service_intervall_km: 10_000, service_intervall_monate: 12 };

  it("ohne Intervall: nichts zu erinnern", () => {
    expect(serviceErinnerung(null, [eintrag("service", "2026-01-01", 1)], [], HEUTE)).toEqual({
      zustand: "kein_intervall",
    });
  });

  it("mit Intervall, aber ohne Serviceeintrag: sagt das", () => {
    expect(serviceErinnerung(nurKm, [eintrag("mfk", "2026-01-01", 5_000)], [], HEUTE)).toEqual({
      zustand: "kein_service",
    });
  });

  it("nach Monaten: Termin und Status", () => {
    const e = serviceErinnerung(nurMonate, [eintrag("service", "2025-10-01")], [], HEUTE);
    expect(e).toMatchObject({
      zustand: "offen",
      faelligAm: "2026-10-01",
      tage: 14,
      status: "bald",
      restKm: null,
      massgeblich: "datum",
    });
  });

  it("nach Kilometern mit Kilometerstand: Differenz zur Schätzung", () => {
    const e = serviceErinnerung(
      nurKm,
      [eintrag("service", "2026-01-01", 20_000), eintrag("pneuwechsel", "2026-04-01", 29_000)],
      [fahrt("2026-05-01", 600)],
      HEUTE,
    );
    expect(e).toMatchObject({
      zustand: "offen",
      kmSeitService: 9_600,
      restKm: 400,
      kmQuelle: "kilometerstand",
      status: "bald",
      massgeblich: "km",
    });
  });

  it("nach Kilometern ohne Stand beim Service: nur die aufgezeichneten Fahrten", () => {
    const e = serviceErinnerung(
      nurKm,
      [eintrag("service", "2026-01-01")],
      [fahrt("2026-01-01", 5_000), fahrt("2026-02-01", 10_050)],
      HEUTE,
    );
    expect(e).toMatchObject({ kmSeitService: 10_050, restKm: -50, kmQuelle: "fahrten", status: "ueberfaellig" });
  });

  it("ohne Fahrten und ohne Stand: null km, also ok — keine erfundene Warnung", () => {
    const e = serviceErinnerung(nurKm, [eintrag("service", "2026-01-01")], [], HEUTE);
    expect(e).toMatchObject({ kmSeitService: 0, restKm: 10_000, status: "ok" });
  });

  it("was zuerst eintritt, bestimmt den Status", () => {
    // Datum: noch ~3.5 Monate (ok). Kilometer: 50 übrig (fällig).
    const e = serviceErinnerung(
      beides,
      [eintrag("service", "2026-01-01", 0)],
      [fahrt("2026-03-01", 9_950)],
      HEUTE,
    );
    expect(e).toMatchObject({ status: "faellig", massgeblich: "km", faelligAm: "2027-01-01" });

    // Umgekehrt: Datum überfällig, Kilometer ok.
    const f = serviceErinnerung(beides, [eintrag("service", "2025-01-01", 0)], [], HEUTE);
    expect(f).toMatchObject({ status: "ueberfaellig", massgeblich: "datum" });
  });

  it("der jüngste Service zählt, nicht der erste", () => {
    const e = serviceErinnerung(
      nurMonate,
      [eintrag("service", "2024-01-01"), eintrag("service", "2026-06-01")],
      [],
      HEUTE,
    );
    expect(e).toMatchObject({ faelligAm: "2027-06-01", status: "ok" });
  });
});

describe("Texte", () => {
  it("trennt Tausender mit Apostroph", () => {
    expect(kmText(12_400)).toBe("12'400 km");
    expect(kmText(999)).toBe("999 km");
    expect(kmText(1_000_000)).toBe("1'000'000 km");
    expect(kmText(12.6)).toBe("13 km");
  });

  it("formatiert Daten ohne Zeitzone", () => {
    expect(datumText("2026-01-01")).toBe("01.01.2026");
  });

  it("relative Tage", () => {
    expect(relativeTage(0)).toBe("heute");
    expect(relativeTage(1)).toBe("morgen");
    expect(relativeTage(-1)).toBe("seit gestern");
    expect(relativeTage(5)).toBe("in 5 Tagen");
    expect(relativeTage(13)).toBe("in 13 Tagen");
    expect(relativeTage(21)).toBe("in 3 Wochen");
    expect(relativeTage(-30)).toBe("seit 4 Wochen");
    expect(relativeTage(90)).toBe("in 3 Monaten");
  });
});

describe("kurzhinweis", () => {
  const keinService = { zustand: "kein_intervall" } as const;

  it("schweigt, wenn nichts ansteht", () => {
    expect(kurzhinweis({ zustand: "kein_termin" }, keinService)).toBeNull();
    expect(
      kurzhinweis({ zustand: "offen", termin: "2027-09-01", tage: 349, status: "ok" }, keinService),
    ).toBeNull();
    expect(
      kurzhinweis({ zustand: "erledigt", termin: "2026-09-20", erledigtAm: "2026-09-01" }, keinService),
    ).toBeNull();
  });

  it("MFK in drei Wochen", () => {
    expect(
      kurzhinweis({ zustand: "offen", termin: "2026-10-08", tage: 21, status: "bald" }, keinService),
    ).toEqual({ text: "MFK in 3 Wochen", status: "bald" });
  });

  it("der dringlichere von beiden gewinnt", () => {
    const mfk = { zustand: "offen", termin: "2026-10-08", tage: 21, status: "bald" } as const;
    const service = serviceErinnerung(
      { naechste_mfk_am: null, service_intervall_km: 10_000, service_intervall_monate: null },
      [eintrag("service", "2026-01-01", 0)],
      [fahrt("2026-03-01", 10_200)],
      HEUTE,
    );
    expect(kurzhinweis(mfk, service)).toEqual({
      text: "Service überfällig, 200 km drüber",
      status: "ueberfaellig",
    });
  });

  it("bei gleichem Rang bleibt die MFK vorn", () => {
    const mfk = { zustand: "offen", termin: "2026-10-08", tage: 21, status: "bald" } as const;
    const service = serviceErinnerung(
      { naechste_mfk_am: null, service_intervall_km: null, service_intervall_monate: 12 },
      [eintrag("service", "2025-10-01")],
      [],
      HEUTE,
    );
    expect(kurzhinweis(mfk, service)?.text).toBe("MFK in 3 Wochen");
  });
});

describe("Eingabeprüfung Eintrag", () => {
  const gueltig = { art: "service", datum: "2026-09-01", km_stand: "", kosten_chf: "", notiz: "" };

  it("nimmt einen minimalen Eintrag an", () => {
    expect(pruefeEintrag(gueltig, HEUTE)).toEqual({
      ok: true,
      wert: { art: "service", datum: "2026-09-01", km_stand: null, kosten_chf: null, notiz: null },
    });
  });

  it("liest Schweizer Zahlen", () => {
    const r = pruefeEintrag({ ...gueltig, km_stand: "12'400", kosten_chf: "480,50", notiz: "  Öl  " }, HEUTE);
    expect(r).toMatchObject({ ok: true, wert: { km_stand: 12_400, kosten_chf: 480.5, notiz: "Öl" } });
  });

  it("lehnt unbekannte Arten ab", () => {
    expect(pruefeEintrag({ ...gueltig, art: "tuev" }, HEUTE).ok).toBe(false);
    expect(pruefeEintrag({ ...gueltig, art: "" }, HEUTE).ok).toBe(false);
  });

  it("Datum: heute ja, morgen nein, vor 1950 nein", () => {
    expect(pruefeEintrag({ ...gueltig, datum: HEUTE }, HEUTE).ok).toBe(true);
    expect(pruefeEintrag({ ...gueltig, datum: "2026-09-18" }, HEUTE).ok).toBe(false);
    expect(pruefeEintrag({ ...gueltig, datum: "1950-01-01" }, HEUTE).ok).toBe(true);
    expect(pruefeEintrag({ ...gueltig, datum: "1949-12-31" }, HEUTE).ok).toBe(false);
    expect(pruefeEintrag({ ...gueltig, datum: "2026-02-30" }, HEUTE).ok).toBe(false);
  });

  it("Kilometerstand: ganze Zahl in den Grenzen", () => {
    expect(pruefeEintrag({ ...gueltig, km_stand: "0" }, HEUTE).ok).toBe(true);
    expect(pruefeEintrag({ ...gueltig, km_stand: String(MAX_KM_STAND) }, HEUTE).ok).toBe(true);
    expect(pruefeEintrag({ ...gueltig, km_stand: String(MAX_KM_STAND + 1) }, HEUTE).ok).toBe(false);
    expect(pruefeEintrag({ ...gueltig, km_stand: "-5" }, HEUTE).ok).toBe(false);
    expect(pruefeEintrag({ ...gueltig, km_stand: "12.5" }, HEUTE).ok).toBe(false);
  });

  it("Kosten: nicht negativ, höchstens zwei Nachkommastellen", () => {
    expect(pruefeEintrag({ ...gueltig, kosten_chf: "0" }, HEUTE).ok).toBe(true);
    expect(pruefeEintrag({ ...gueltig, kosten_chf: "-1" }, HEUTE).ok).toBe(false);
    expect(pruefeEintrag({ ...gueltig, kosten_chf: "10.555" }, HEUTE).ok).toBe(false);
    expect(pruefeEintrag({ ...gueltig, kosten_chf: "100000" }, HEUTE).ok).toBe(true);
    expect(pruefeEintrag({ ...gueltig, kosten_chf: "100000.01" }, HEUTE).ok).toBe(false);
  });

  it("Notiz: begrenzt", () => {
    expect(pruefeEintrag({ ...gueltig, notiz: "x".repeat(MAX_NOTIZ_LAENGE) }, HEUTE).ok).toBe(true);
    expect(pruefeEintrag({ ...gueltig, notiz: "x".repeat(MAX_NOTIZ_LAENGE + 1) }, HEUTE).ok).toBe(false);
  });
});

describe("Eingabeprüfung Erinnerungen", () => {
  const leer = { naechste_mfk_am: "", service_intervall_km: "", service_intervall_monate: "" };

  it("alles leer ist gültig und leer", () => {
    const r = pruefeErinnerungen(leer, HEUTE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(erinnerungenLeer(r.wert)).toBe(true);
  });

  it("MFK-Termin: vergangen erlaubt, höchstens sechs Jahre voraus", () => {
    expect(pruefeErinnerungen({ ...leer, naechste_mfk_am: "2026-01-01" }, HEUTE).ok).toBe(true);
    expect(pruefeErinnerungen({ ...leer, naechste_mfk_am: "2032-09-17" }, HEUTE).ok).toBe(true);
    expect(pruefeErinnerungen({ ...leer, naechste_mfk_am: "2032-09-18" }, HEUTE).ok).toBe(false);
    expect(pruefeErinnerungen({ ...leer, naechste_mfk_am: "1949-12-31" }, HEUTE).ok).toBe(false);
  });

  it("Intervalle in den Grenzen", () => {
    expect(pruefeErinnerungen({ ...leer, service_intervall_km: "15'000" }, HEUTE)).toMatchObject({
      ok: true,
      wert: { service_intervall_km: 15_000 },
    });
    expect(pruefeErinnerungen({ ...leer, service_intervall_km: "99" }, HEUTE).ok).toBe(false);
    expect(pruefeErinnerungen({ ...leer, service_intervall_km: "100001" }, HEUTE).ok).toBe(false);
    expect(pruefeErinnerungen({ ...leer, service_intervall_monate: "0" }, HEUTE).ok).toBe(false);
    expect(pruefeErinnerungen({ ...leer, service_intervall_monate: "61" }, HEUTE).ok).toBe(false);
    expect(pruefeErinnerungen({ ...leer, service_intervall_monate: "24" }, HEUTE).ok).toBe(true);
  });
});

describe("Zahlen aus Formularfeldern", () => {
  it("ganze Zahlen", () => {
    expect(ganzeZahlOderLeer("")).toBeNull();
    expect(ganzeZahlOderLeer(" 1 200 ")).toBe(1200);
    expect(ganzeZahlOderLeer("1e5")).toBe("ungueltig");
    expect(ganzeZahlOderLeer("abc")).toBe("ungueltig");
  });

  it("Franken", () => {
    expect(frankenOderLeer("")).toBeNull();
    expect(frankenOderLeer("1'250.50")).toBe(1250.5);
    expect(frankenOderLeer("12,")).toBe("ungueltig");
    expect(frankenOderLeer("Infinity")).toBe("ungueltig");
  });
});

describe("artenFuer", () => {
  it("bietet Kette/Antrieb nur beim Motorrad an", () => {
    expect(artenFuer("auto")).not.toContain("kette");
    expect(artenFuer("motorrad")).toContain("kette");
  });
});
