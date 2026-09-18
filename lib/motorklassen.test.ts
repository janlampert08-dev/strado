import { describe, it, expect } from "vitest";
import {
  FAHRZEUGTYPEN,
  MOTORKLASSEN,
  filterImSatz,
  filterLabel,
  filterTyp,
  hoehereKlasse,
  istFahrzeugTyp,
  istKlassenfilter,
  istMotorklasse,
  klassenFuerFilter,
  klassenFuerTyp,
  kwInPs,
  motorklasseFor,
  motorklassendefinition,
  psInKw,
} from "./motorklassen";
import type { Klassenfilter } from "./motorklassen";
import type { Motorklasse } from "@/types/database";

// Die Grenzwerte stehen zweimal im Projekt: hier bzw. in lib/motorklassen.ts
// und in public.motorklasse() (0080_motorklassen.sql). Diese Tabelle ist die
// Absicherung dagegen, dass die beiden auseinanderlaufen — wer eine Grenze
// verschiebt, muss sie hier und in der Migration verschieben.
describe("motorklasseFor", () => {
  const faelle: [string, Parameters<typeof motorklasseFor>[0], Motorklasse | null][] = [
    ["125er-Roller", { typ: "motorrad", hubraum_ccm: 125, leistung_kw: 11 }, "moto_a1"],
    ["A1-Grenze bei 11 kW", { typ: "motorrad", hubraum_ccm: 125, leistung_kw: 11.01 }, "moto_a35"],
    ["A1-Grenze bei 125 cm³", { typ: "motorrad", hubraum_ccm: 126, leistung_kw: 11 }, "moto_a35"],
    ["A-35-kW-Grenze", { typ: "motorrad", hubraum_ccm: 471, leistung_kw: 35 }, "moto_a35"],
    ["Ducati Panigale", { typ: "motorrad", hubraum_ccm: 1103, leistung_kw: 157 }, "moto_a"],
    ["Golf 1.5 TSI", { typ: "auto", hubraum_ccm: 1498, leistung_kw: 96 }, "auto_bis110"],
    ["Auto-Grenze bei 110 kW", { typ: "auto", leistung_kw: 110 }, "auto_bis110"],
    ["Golf GTI", { typ: "auto", leistung_kw: 180 }, "auto_bis220"],
    ["Auto-Grenze bei 220 kW", { typ: "auto", leistung_kw: 220 }, "auto_bis220"],
    ["Porsche 911", { typ: "auto", leistung_kw: 283 }, "auto_ueber220"],
  ];

  for (const [name, fahrzeug, erwartet] of faelle) {
    it(`ordnet ${name} in ${erwartet} ein`, () => {
      expect(motorklasseFor(fahrzeug)).toBe(erwartet);
    });
  }

  it("liefert ohne Leistungsangabe keine Klasse", () => {
    // Die Angabe ist freiwillig. Ohne sie zählt die Fahrt weiter in der
    // Gesamtwertung, aber in keiner Klassenliste — sie darf deshalb nicht
    // ersatzweise in die kleinste Klasse fallen.
    expect(motorklasseFor({ typ: "auto", leistung_kw: null })).toBeNull();
    expect(motorklasseFor({ typ: "motorrad", hubraum_ccm: 125 })).toBeNull();
  });

  it("behandelt ein Motorrad ohne Hubraum als A1-fähig", () => {
    // Ein E-Motorrad hat keinen Hubraum. Mit 11 kW gehört es sachlich nach
    // A1 — ein fehlender Wert darf es nicht in die nächsthöhere Klasse
    // schieben. Gegenstück zum coalesce(p_ccm, 0) in der Migration.
    expect(motorklasseFor({ typ: "motorrad", hubraum_ccm: null, leistung_kw: 11 })).toBe(
      "moto_a1",
    );
  });

  it("verwirft unbrauchbare Leistungswerte statt sie einzuordnen", () => {
    expect(motorklasseFor({ typ: "auto", leistung_kw: 0 })).toBeNull();
    expect(motorklasseFor({ typ: "auto", leistung_kw: -50 })).toBeNull();
    expect(motorklasseFor({ typ: "auto", leistung_kw: Number.NaN })).toBeNull();
  });
});

describe("hoehereKlasse", () => {
  it("nimmt innerhalb eines Fahrzeugtyps die höhere", () => {
    expect(hoehereKlasse("moto_a1", "moto_a")).toBe("moto_a");
    expect(hoehereKlasse("moto_a", "moto_a1")).toBe("moto_a");
    expect(hoehereKlasse("auto_bis110", "auto_bis220")).toBe("auto_bis220");
  });

  it("stuft nie ab", () => {
    // Der Kern der Belegprüfung: dass jemand langsamer war als seine Klasse
    // hergibt, beweist nichts (Verkehr, Nässe, Vorsicht). Eine ehrliche
    // Fahrt darf dadurch nie schlechter gestellt werden.
    expect(hoehereKlasse("auto_ueber220", "auto_bis110")).toBe("auto_ueber220");
  });

  it("mischt keine Fahrzeugtypen und behält dann die deklarierte Klasse", () => {
    expect(hoehereKlasse("moto_a1", "auto_ueber220")).toBe("moto_a1");
  });

  it("kommt mit fehlenden Werten zurecht", () => {
    expect(hoehereKlasse(null, "moto_a35")).toBe("moto_a35");
    expect(hoehereKlasse("moto_a35", null)).toBe("moto_a35");
    expect(hoehereKlasse(null, null)).toBeNull();
  });
});

describe("Katalog", () => {
  it("führt je Fahrzeugtyp drei Klassen mit den Rängen 1 bis 3", () => {
    for (const typ of ["auto", "motorrad"] as const) {
      expect(klassenFuerTyp(typ).map((k) => k.rang)).toEqual([1, 2, 3]);
    }
  });

  it("hat eindeutige Schlüssel", () => {
    const ids = MOTORKLASSEN.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("erkennt nur Schlüssel aus dem Katalog", () => {
    // Der Wächter für ?klasse= am öffentlichen Endpunkt: was hier nicht
    // durchkommt, darf nie in eine Abfrage.
    expect(istMotorklasse("moto_a1")).toBe(true);
    expect(istMotorklasse("moto_a2")).toBe(false);
    expect(istMotorklasse("")).toBe(false);
    expect(istMotorklasse(null)).toBe(false);
    expect(istMotorklasse("'; drop table route_completions; --")).toBe(false);
  });
});

describe("kwInPs", () => {
  it("rechnet die Bandgrenzen auf die angezeigten PS-Werte", () => {
    expect(kwInPs(110)).toBe(150);
    expect(kwInPs(220)).toBe(299);
  });
});

// Autos werden in PS eingegeben, gespeichert wird kW. Diese Tabelle ist die
// Absicherung dafür, dass die Beschriftung der Auto-Chips und das, was eine
// PS-Eingabe tatsächlich auslöst, dasselbe sagen — die Chips nennen genau
// diese Zahlen, und jemand tippt sie ab.
describe("psInKw", () => {
  it("führt die beworbene PS-Zahl auf die kW-Zahl des Fahrzeugausweises zurück", () => {
    // "110 kW / 150 PS" auf dem Datenblatt: 110 kW sind 149.6 PS, die 150
    // ist bereits gerundet. Ohne Rundung ergäbe die Rückrechnung 110.33 kW
    // und schöbe genau diesen Wagen über die 110-kW-Grenze.
    expect(psInKw(150)).toBe(110);
    expect(psInKw(204)).toBe(150);
    expect(psInKw(1)).toBe(1);
  });

  const bandgrenzen: [number, Motorklasse][] = [
    [1, "auto_bis110"],
    [150, "auto_bis110"],
    [151, "auto_bis220"],
    [299, "auto_bis220"],
    [300, "auto_ueber220"],
  ];

  for (const [ps, erwartet] of bandgrenzen) {
    it(`ordnet ${ps} PS in ${erwartet} ein`, () => {
      expect(motorklasseFor({ typ: "auto", leistung_kw: psInKw(ps) })).toBe(erwartet);
    });
  }

  it("beschriftet die Auto-Bänder mit genau diesen Grenzen", () => {
    // Sonst steht auf einem Chip eine Zahl, die beim Eintippen woanders
    // landet — bei einer kW-Eingabe eine Rundungsunschärfe, bei einer
    // PS-Eingabe eine falsche Auskunft.
    expect(motorklassendefinition("auto_bis110").label).toBe("bis 150 PS");
    expect(motorklassendefinition("auto_bis220").label).toBe("151–299 PS");
    expect(motorklassendefinition("auto_ueber220").label).toBe("ab 300 PS");
  });

  it("bleibt innerhalb der Schranke aus 0080, wenn die PS-Obergrenze erreicht ist", () => {
    // lib/actions/vehicles.ts leitet MAX_LEISTUNG_PS aus MAX_LEISTUNG_KW ab;
    // die Rückrechnung darf den CHECK (leistung_kw <= 2000) nicht verletzen.
    expect(psInKw(kwInPs(2000))).toBeLessThanOrEqual(2000);
  });
});

describe("Fahrzeugtypen und Klassenfilter", () => {
  it("gibt jedem Fahrzeugtyp aus dem Klassenkatalog einen Eintrag", () => {
    // Ohne das fehlte im Chip-Band eine ganze Welt, während ihre Klassen
    // weiter in den Ranglisten stünden.
    const typenImKatalog = new Set(MOTORKLASSEN.map((k) => k.typ));
    expect(new Set(FAHRZEUGTYPEN.map((t) => t.id))).toEqual(typenImKatalog);
  });

  it("hält Fahrzeugtyp- und Klassenschlüssel überschneidungsfrei", () => {
    // Beide Stufen teilen sich einen URL-Parameter (?klasse=). Ein
    // gemeinsamer Schlüssel machte die Auswahl mehrdeutig.
    const typen = FAHRZEUGTYPEN.map((t) => t.id as string);
    const klassen = MOTORKLASSEN.map((k) => k.id as string);
    expect(typen.filter((t) => klassen.includes(t))).toEqual([]);
  });

  it("erkennt nur Schlüssel aus beiden Katalogen", () => {
    // Der Wächter für ?klasse= am öffentlichen Endpunkt, jetzt zweistufig.
    expect(istKlassenfilter("auto")).toBe(true);
    expect(istKlassenfilter("motorrad")).toBe(true);
    expect(istKlassenfilter("auto_bis110")).toBe(true);
    expect(istKlassenfilter("lastwagen")).toBe(false);
    expect(istKlassenfilter("moto_a2")).toBe(false);
    expect(istKlassenfilter("")).toBe(false);
    expect(istKlassenfilter(null)).toBe(false);
    expect(istKlassenfilter("'; drop table route_completions; --")).toBe(false);
  });

  it("trennt Fahrzeugtypen von Motorklassen", () => {
    expect(istFahrzeugTyp("auto")).toBe(true);
    expect(istFahrzeugTyp("auto_bis110")).toBe(false);
    expect(istMotorklasse("auto")).toBe(false);
  });

  it("ordnet jeden Filter seinem Fahrzeugtyp zu", () => {
    expect(filterTyp("auto")).toBe("auto");
    expect(filterTyp("auto_ueber220")).toBe("auto");
    expect(filterTyp("motorrad")).toBe("motorrad");
    expect(filterTyp("moto_a1")).toBe("motorrad");
  });

  it("löst einen Filter in die Klassen auf, die er umfasst", () => {
    // Die Übersetzung für route_leaderboard, das nur die Spalte motorklasse
    // kennt: aus der Typstufe wird dort ein IN über drei Werte.
    expect(klassenFuerFilter("auto")).toEqual([
      "auto_bis110",
      "auto_bis220",
      "auto_ueber220",
    ]);
    expect(klassenFuerFilter("moto_a35")).toEqual(["moto_a35"]);

    // Dieselben Klassen wie klassenFuerTyp — eine Abweichung hiesse, dass
    // die Chip-Leiste und die Abfrage über verschiedene Mengen reden.
    for (const typ of ["auto", "motorrad"] as const) {
      expect(klassenFuerFilter(typ)).toEqual(klassenFuerTyp(typ).map((k) => k.id));
    }
  });

  it("beschriftet jeden Filter", () => {
    const filter: Klassenfilter[] = [
      ...FAHRZEUGTYPEN.map((t) => t.id),
      ...MOTORKLASSEN.map((k) => k.id),
    ];
    for (const f of filter) {
      expect(filterLabel(f).length).toBeGreaterThan(0);
    }
    expect(filterLabel("auto")).toBe("Autos");
    expect(filterLabel("moto_a1")).toBe("A1");
  });
});

describe("filterImSatz", () => {
  // Die Leerzustände setzen das Ergebnis mitten in einen Satz. Vorher stand
  // dort filterLabel(), und daraus wurde "in bis 150 PS" oder "in Motorräder".
  it("setzt eine Klasse hinter 'in der Klasse'", () => {
    expect(filterImSatz("auto_bis110")).toBe("in der Klasse bis 150 PS");
    expect(filterImSatz("moto_a")).toBe("in der Klasse A offen");
  });

  it("nennt einen Fahrzeugtyp im Singular", () => {
    expect(filterImSatz("auto")).toBe("mit dem Auto");
    expect(filterImSatz("motorrad")).toBe("mit dem Motorrad");
  });
});
