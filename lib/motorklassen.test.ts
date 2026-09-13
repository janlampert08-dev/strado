import { describe, it, expect } from "vitest";
import {
  MOTORKLASSEN,
  hoehereKlasse,
  istMotorklasse,
  klassenFuerTyp,
  kwInPs,
  motorklasseFor,
} from "./motorklassen";
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
