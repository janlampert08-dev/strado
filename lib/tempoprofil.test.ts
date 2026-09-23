import { describe, expect, it } from "vitest";
import {
  MAX_TEMPOPROFIL_PUNKTE,
  alsTempoprofil,
  buildTempoprofil,
  stimmigerSchnitt,
  tempoAbschnitte,
} from "@/lib/tempoprofil";
import { haversineKm, type TrailPoint } from "@/lib/geo";
import { speedStufe } from "@/lib/speed";

// Ost-West-Verlauf auf 47.37° N, ein Punkt je Sekunde. Die Schrittweite in
// Grad wird aus dem gewünschten Tempo abgeleitet, damit die Tests in km/h
// denken können statt in Grad.
const KM_JE_GRAD = haversineKm([8.5, 47.37], [9.5, 47.37]);

function fahrt(abschnitte: { kmh: number; sekunden: number }[]): TrailPoint[] {
  const punkte: TrailPoint[] = [{ lng: 8.5, lat: 47.37, t: 0 }];
  let lng = 8.5;
  let s = 0;
  for (const a of abschnitte) {
    const gradJeSekunde = a.kmh / 3600 / KM_JE_GRAD;
    for (let i = 0; i < a.sekunden; i++) {
      lng += gradJeSekunde;
      s += 1;
      punkte.push({ lng, lat: 47.37, t: s * 1000 });
    }
  }
  return punkte;
}

describe("buildTempoprofil", () => {
  it("gibt bei gleichmässigem Tempo überall dieses Tempo zurück", () => {
    const profil = buildTempoprofil(fahrt([{ kmh: 60, sekunden: 600 }]))!;
    expect(profil.length).toBeGreaterThan(10);
    for (const p of profil) expect(p.kmh).toBeGreaterThanOrEqual(59);
    for (const p of profil) expect(p.kmh).toBeLessThanOrEqual(61);
  });

  it("zeigt einen langsamen Abschnitt dort, wo er gefahren wurde", () => {
    // 5 km mit 100, 2 km mit 30, 5 km mit 100.
    const profil = buildTempoprofil(
      fahrt([
        { kmh: 100, sekunden: 180 },
        { kmh: 30, sekunden: 240 },
        { kmh: 100, sekunden: 180 },
      ]),
    )!;
    const bei = (km: number) => profil.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a));
    expect(bei(2).kmh).toBeGreaterThan(95);
    expect(bei(6).kmh).toBeLessThan(35);
    expect(bei(10).kmh).toBeGreaterThan(95);
  });

  it("lässt eine Pause als Tempo nahe null an ihrer Stelle erscheinen", () => {
    const vor = fahrt([{ kmh: 60, sekunden: 120 }]);
    const ende = vor[vor.length - 1];
    // Fünf Minuten Stillstand mit GPS-Zittern von wenigen Metern.
    const pause: TrailPoint[] = Array.from({ length: 300 }, (_, i) => ({
      lng: ende.lng + (i % 2 ? 0.00002 : 0),
      lat: ende.lat,
      t: ende.t + (i + 1) * 1000,
    }));
    const nach = fahrt([{ kmh: 60, sekunden: 120 }]).slice(1).map((p) => ({
      lng: p.lng - 8.5 + ende.lng,
      lat: p.lat,
      t: p.t + ende.t + 300_000,
    }));
    const profil = buildTempoprofil([...vor, ...pause, ...nach])!;
    const minimum = Math.min(...profil.map((p) => p.kmh));
    expect(minimum).toBeLessThan(10);
    // Die Pause verlängert die Strecke nicht.
    expect(profil[profil.length - 1].km).toBeCloseTo(4, 0);
  });

  it("begrenzt die Anzahl der Stützpunkte auch bei langen Fahrten", () => {
    const profil = buildTempoprofil(fahrt([{ kmh: 80, sekunden: 4 * 3600 }]))!;
    expect(profil.length).toBeLessThanOrEqual(MAX_TEMPOPROFIL_PUNKTE + 1);
    expect(profil[profil.length - 1].km).toBeCloseTo(320, 0);
  });

  it("gibt für sehr kurze Aufzeichnungen null zurück", () => {
    expect(buildTempoprofil(fahrt([{ kmh: 30, sekunden: 30 }]))).toBeNull();
    expect(buildTempoprofil([])).toBeNull();
  });

  it("kappt Messfehler statt absurde Werte zu speichern", () => {
    const profil = buildTempoprofil(fahrt([{ kmh: 900, sekunden: 30 }]))!;
    for (const p of profil) expect(p.kmh).toBeLessThanOrEqual(250);
  });
});

describe("tempoAbschnitte", () => {
  const linie: [number, number][] = [
    [8.5, 47.37],
    [8.5 + 10 / KM_JE_GRAD, 47.37],
  ];

  it("färbt eine Gerade mit nur zwei Punkten trotzdem abschnittsweise ein", () => {
    const abschnitte = tempoAbschnitte(linie, [
      { km: 0, kmh: 100 },
      { km: 4, kmh: 100 },
      { km: 6, kmh: 30 },
      { km: 10, kmh: 30 },
    ]);
    expect(abschnitte.map((a) => a.stufe)).toEqual([speedStufe(100), speedStufe(30)]);
    // Die Grenze liegt zwischen km 4 und 6, also bei km 5 — der Mitte.
    const grenzeLng = abschnitte[0].coords[abschnitte[0].coords.length - 1][0];
    expect(haversineKm(linie[0], [grenzeLng, 47.37])).toBeCloseTo(5, 1);
  });

  it("legt gleichfarbige Nachbarn zu einem Abschnitt zusammen", () => {
    const abschnitte = tempoAbschnitte(linie, [
      { km: 0, kmh: 70 },
      { km: 5, kmh: 75 },
      { km: 10, kmh: 72 },
    ]);
    expect(abschnitte).toHaveLength(1);
  });

  it("streckt ein längeres Profil auf die kürzere, vereinfachte Linie", () => {
    const abschnitte = tempoAbschnitte(linie, [
      { km: 0, kmh: 100 },
      { km: 11, kmh: 100 },
    ]);
    const ende = abschnitte[0].coords[abschnitte[0].coords.length - 1];
    expect(ende[0]).toBeCloseTo(linie[1][0], 6);
  });
});

describe("alsTempoprofil", () => {
  it("lässt nur wohlgeformte Profile durch", () => {
    expect(alsTempoprofil(null)).toBeNull();
    expect(alsTempoprofil([{ km: 0, kmh: 1 }])).toBeNull();
    expect(alsTempoprofil([{ km: 0, kmh: 1 }, { km: "1", kmh: 2 }])).toBeNull();
    expect(alsTempoprofil([{ km: 0, kmh: 1 }, { km: 1, kmh: 2 }])).toHaveLength(2);
  });
});

describe("stimmigerSchnitt", () => {
  const profil = [
    { km: 0, kmh: 40 },
    { km: 5, kmh: 74 },
    { km: 10, kmh: 50 },
  ];

  it("keeps an average below the profile peak", () => {
    expect(stimmigerSchnitt(49, profil)).toBe(49);
  });

  it("tolerates rounding right at the peak", () => {
    expect(stimmigerSchnitt(75.5, profil)).toBe(75.5);
  });

  // Live gesehen auf Fahrt 77992c64: "Ø 86 km/h" neben "Spitze 74 km/h".
  it("drops an average above the profile peak", () => {
    expect(stimmigerSchnitt(86, profil)).toBeNull();
  });

  it("keeps the average when there is no profile to check against", () => {
    expect(stimmigerSchnitt(86, null)).toBe(86);
  });

  it("passes null and non-finite values through as null", () => {
    expect(stimmigerSchnitt(null, profil)).toBeNull();
    expect(stimmigerSchnitt(Number.POSITIVE_INFINITY, profil)).toBeNull();
  });
});
