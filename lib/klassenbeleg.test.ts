import { describe, it, expect } from "vitest";
import { belegeMotorklasse } from "./klassenbeleg";
import type { TrailPoint } from "@/lib/geo";
import type { FahrzeugTyp } from "@/types/database";

// Ein gerader Trail nach Osten auf 47° Nord, ein Fix pro Sekunde. Reicht für
// alle Prüfungen hier: die Funktion misst Tempo, Beschleunigung und (über
// das separat übergebene Höhenprofil) die Steigung — die Linienführung
// selbst geht nicht ein.
const METER_PRO_GRAD_LNG = 111_320 * Math.cos((47 * Math.PI) / 180);

function trail(abschnitte: { kmh: number; sekunden: number }[]): TrailPoint[] {
  const punkte: TrailPoint[] = [];
  let lng = 8.5;
  let t = Date.UTC(2026, 8, 11, 9, 0, 0);
  punkte.push({ lng, lat: 47, t });
  for (const abschnitt of abschnitte) {
    const meterProSekunde = abschnitt.kmh / 3.6;
    for (let i = 0; i < abschnitt.sekunden; i++) {
      lng += meterProSekunde / METER_PRO_GRAD_LNG;
      t += 1000;
      punkte.push({ lng, lat: 47, t });
    }
  }
  return punkte;
}

// Ein gleichmässig steigendes Höhenprofil über die angegebene Länge.
function steigungsprofil(laengeKm: number, prozent: number): { km: number; m: number }[] {
  const punkte: { km: number; m: number }[] = [];
  for (let km = 0; km <= laengeKm; km += 0.1) {
    punkte.push({ km: Number(km.toFixed(2)), m: Math.round(500 + km * 1000 * (prozent / 100)) });
  }
  return punkte;
}

function belege(typ: FahrzeugTyp, abschnitte: { kmh: number; sekunden: number }[], profil?: { km: number; m: number }[]) {
  return belegeMotorklasse(typ, trail(abschnitte), profil);
}

describe("belegeMotorklasse — kein Urteil bei dünner Datenlage", () => {
  it("urteilt nicht über eine zu kurze Aufzeichnung", () => {
    // Unter den Mindestgrössen gibt es keine Aussage — und "keine Aussage"
    // heisst hier: keine Hochstufung. Das ist der wichtigste Ausgang
    // überhaupt, weil er der Normalfall für kurze Stadtfahrten ist.
    expect(belege("motorrad", [{ kmh: 50, sekunden: 60 }]).klasse).toBeNull();
  });

  it("urteilt nicht über einen Trail ohne Zeitfortschritt", () => {
    const punkte: TrailPoint[] = Array.from({ length: 50 }, (_, i) => ({
      lng: 8.5 + i / METER_PRO_GRAD_LNG,
      lat: 47,
      t: Date.UTC(2026, 8, 11, 9, 0, 0),
    }));
    expect(belegeMotorklasse("auto", punkte).klasse).toBeNull();
  });

  it("urteilt nicht über eine leere Aufzeichnung", () => {
    expect(belegeMotorklasse("auto", []).klasse).toBeNull();
  });
});

describe("belegeMotorklasse — die belegte Klasse ist eine Untergrenze", () => {
  it("belegt für eine gemütliche Rollerfahrt nur die kleinste Klasse", () => {
    // 45 km/h über zehn Minuten: das schafft jeder 125er. Die Funktion darf
    // hier nichts anderes als A1 liefern, sonst würde sie ehrliche Fahrten
    // hochstufen.
    const beleg = belege("motorrad", [{ kmh: 45, sekunden: 600 }]);
    expect(beleg.klasse).toBe("moto_a1");
    expect(beleg.kennzahlen.leistungKw).toBeLessThan(11);
  });

  it("belegt für eine ruhige Autofahrt nur die kleinste Autoklasse", () => {
    const beleg = belege("auto", [{ kmh: 80, sekunden: 600 }]);
    expect(beleg.klasse).toBe("auto_bis110");
  });

  it("hält den Sicherheitsabstand zur Klassengrenze ein", () => {
    // 130 km/h Dauertempo verlangen rund 11.8 kW und lägen damit knapp über
    // der A1-Grenze von 11 kW. Genau dieser Grenzfall darf NICHT hochstufen:
    // die Schwellen sind gerechnet, nicht an echten Fahrten geeicht, und
    // solange das so ist, ersetzt der Abstand die fehlende Evidenz.
    const beleg = belege("motorrad", [{ kmh: 130, sekunden: 300 }]);
    expect(beleg.kennzahlen.leistungKw).toBeGreaterThan(11);
    expect(beleg.klasse).toBe("moto_a1");
  });

  it("widerlegt A1 bei Dauertempo, das 11 kW nicht hergeben", () => {
    // 150 km/h über mehrere Minuten: rund 17.8 kW. Das reisst die A1-Grenze
    // auch mit dem Sicherheitsabstand (11 × 1.3 = 14.3 kW). Allein der
    // Luftwiderstand verlangt dort ein Mehrfaches dessen, was ein
    // A1-Fahrzeug leistet — egal wie günstig man Masse und Stirnfläche
    // annimmt.
    const beleg = belege("motorrad", [{ kmh: 150, sekunden: 300 }]);
    expect(beleg.kennzahlen.leistungKw).toBeGreaterThan(11);
    expect(beleg.klasse).not.toBe("moto_a1");
  });
});

describe("belegeMotorklasse — Beschleunigung verrät die Masse", () => {
  it("sieht im Herausbeschleunigen mehr Leistung als im blossen Tempo", () => {
    // Das ist der Fall, auf den es ankommt: ein schwerer, starker Wagen,
    // der nie besonders schnell fährt, aber beschleunigt wie einer. Ohne
    // den Beschleunigungsterm bliebe er unauffällig.
    const gleichmaessig = belege("auto", [{ kmh: 120, sekunden: 600 }]);
    const wechselnd = belege(
      "auto",
      Array.from({ length: 6 }, () => [
        { kmh: 30, sekunden: 60 },
        { kmh: 120, sekunden: 60 },
      ]).flat(),
    );
    expect(wechselnd.kennzahlen.spitzenleistungKw).toBeGreaterThan(
      gleichmaessig.kennzahlen.spitzenleistungKw,
    );
  });

  it("verlangt für die nachgewiesene Leistung mehrere Beschleunigungen", () => {
    // NACHWEIS_SEKUNDEN ist bewusst länger als ein einzelnes Fenster: zwei
    // Ampelstarts sind kein Beweis, ein ganzer Nachmittag Herausbeschleunigen
    // schon. Genau dieser Unterschied wird hier festgehalten — mit zwei
    // Wechseln bleibt die nachgewiesene Leistung auf dem Niveau der
    // gleichmässigen Fahrt, mit sechs liegt sie darüber.
    const gleichmaessig = belege("auto", [{ kmh: 120, sekunden: 600 }]).kennzahlen.leistungKw;
    const zweiWechsel = belege("auto", [
      { kmh: 30, sekunden: 180 },
      { kmh: 120, sekunden: 180 },
      { kmh: 30, sekunden: 180 },
      { kmh: 120, sekunden: 180 },
    ]).kennzahlen.leistungKw;
    const sechsWechsel = belege(
      "auto",
      Array.from({ length: 6 }, () => [
        { kmh: 30, sekunden: 60 },
        { kmh: 120, sekunden: 60 },
      ]).flat(),
    ).kennzahlen.leistungKw;

    expect(zweiWechsel).toBeCloseTo(gleichmaessig, 1);
    expect(sechsWechsel).toBeGreaterThan(gleichmaessig);
  });

  it("lässt sich von einem einzelnen Ausreisser nicht hochstufen", () => {
    // Ein einziges schnelles Fenster in einer sonst ruhigen Fahrt darf die
    // Klasse nicht heben: die Leistung muss NACHWEIS_SEKUNDEN lang
    // gehalten worden sein.
    const ruhig = belege("motorrad", [{ kmh: 45, sekunden: 900 }]);
    const mitAusreisser = belege("motorrad", [
      { kmh: 45, sekunden: 450 },
      { kmh: 200, sekunden: 11 },
      { kmh: 45, sekunden: 450 },
    ]);
    expect(mitAusreisser.klasse).toBe(ruhig.klasse);
  });
});

describe("belegeMotorklasse — Steigung", () => {
  it("rechnet mit Höhenprofil eine höhere Leistung als ohne", () => {
    // Am Berg schlägt das Leistungsgewicht durch. Dasselbe Tempo bergauf
    // verlangt mehr Leistung als in der Ebene — genau das ist das Signal,
    // das eine Bergstrasse liefert und eine Autobahn nicht.
    const abschnitte = [{ kmh: 90, sekunden: 600 }];
    const laengeKm = (90 / 3.6) * 600 / 1000;
    const flach = belege("motorrad", abschnitte);
    const bergauf = belege("motorrad", abschnitte, steigungsprofil(laengeKm, 9));
    expect(bergauf.kennzahlen.leistungKw).toBeGreaterThan(flach.kennzahlen.leistungKw);
    expect(bergauf.kennzahlen.mitSteigung).toBe(true);
    expect(flach.kennzahlen.mitSteigung).toBe(false);
  });

  it("ignoriert ein Gefälle, statt daraus Leistung abzuleiten", () => {
    // Bergab braucht ein Fahrzeug keine Motorleistung. Ein negativer
    // Hangabtrieb dürfte die Schätzung nicht künstlich senken — sie wird
    // deshalb bei 0 gekappt, nicht ins Negative gezogen.
    const abschnitte = [{ kmh: 90, sekunden: 600 }];
    const laengeKm = (90 / 3.6) * 600 / 1000;
    const flach = belege("motorrad", abschnitte);
    const bergab = belege("motorrad", abschnitte, steigungsprofil(laengeKm, -9));
    expect(bergab.kennzahlen.leistungKw).toBeCloseTo(flach.kennzahlen.leistungKw, 1);
  });
});
