import { afterEach, describe, expect, it, vi } from "vitest";
import { haversineKm } from "@/lib/geo";
import {
  RADIUS_MAX_FAKTOR,
  RADIUS_MIN_FAKTOR,
  VERSCHIEBUNG_MAX_ANTEIL,
  privatzonenGeheimnis,
  privatzonenKreis,
  verschleiertGekappt,
} from "@/lib/privatzone";

// Die verschleierte Privatzone (lib/privatzone.ts). Geprüft wird, was sie
// verspricht: (1) nie weniger als r zwischen Startpunkt und erstem
// sichtbarem Punkt, (2) derselbe Kreis für denselben Nutzer am selben Ort,
// (3) ein ANDERER Kreis für einen anderen Nutzer, einen anderen Ort oder ein
// anderes Geheimnis, (4) die sichtbaren Enden liegen NICHT mehr auf einem
// Kreis um die Haustür — genau das war der Angriff.

const GEHEIMNIS = "test-geheimnis";
const HAUS: [number, number] = [8.5412, 47.3769];

// Eine Fahrt, die an der Haustür beginnt und geradlinig in Richtung
// `grad` (0 = Nord, 90 = Ost) 5 km wegführt, ein Punkt alle ~20 m.
function fahrtAb(start: [number, number], grad: number, km = 5): [number, number][] {
  const punkte: [number, number][] = [];
  const schritte = Math.round((km * 1000) / 20);
  const rad = (grad * Math.PI) / 180;
  for (let i = 0; i <= schritte; i++) {
    const m = i * 20;
    const dLat = (m * Math.cos(rad)) / 111_320;
    const dLng = (m * Math.sin(rad)) / (111_320 * Math.cos((start[1] * Math.PI) / 180));
    punkte.push([start[0] + dLng, start[1] + dLat]);
  }
  return punkte;
}

// Hin und zurück: dieselbe Linie rückwärts angehängt.
function rundfahrtAb(start: [number, number], grad: number): [number, number][] {
  const hin = fahrtAb(start, grad);
  return [...hin, ...hin.slice(0, -1).reverse()];
}

const meter = (a: [number, number], b: [number, number]) => haversineKm(a, b) * 1000;

describe("privatzonenKreis", () => {
  it("ist deterministisch", () => {
    expect(privatzonenKreis(HAUS, 200, "u1", GEHEIMNIS)).toEqual(
      privatzonenKreis(HAUS, 200, "u1", GEHEIMNIS),
    );
  });

  it("gibt für leicht verschobene Starts vor derselben Haustür denselben Mittelpunkt", () => {
    // GPS-Streuung von wenigen Metern darf keine neue Stichprobe erzeugen —
    // sonst liesse sich über viele Fahrten mitteln.
    const a = privatzonenKreis(HAUS, 200, "u1", GEHEIMNIS);
    const b = privatzonenKreis([HAUS[0] + 0.00005, HAUS[1] + 0.00003], 200, "u1", GEHEIMNIS);
    // Gleiche Verschiebung, also Mittelpunkte im selben Abstand wie die Starts.
    expect(b.radiusM).toBe(a.radiusM);
    expect(meter(a.zentrum, b.zentrum)).toBeLessThan(10);
  });

  it("unterscheidet sich zwischen Nutzern, Orten und Geheimnissen", () => {
    const basis = privatzonenKreis(HAUS, 200, "u1", GEHEIMNIS);
    const andererNutzer = privatzonenKreis(HAUS, 200, "u2", GEHEIMNIS);
    const anderesGeheimnis = privatzonenKreis(HAUS, 200, "u1", "anderes");
    expect(andererNutzer).not.toEqual(basis);
    expect(anderesGeheimnis).not.toEqual(basis);

    // Ein anderer Ort desselben Nutzers bekommt eine eigene Verschiebung:
    // wer die Verschiebung an einem bekannten Ort nachmisst, kennt sie
    // nicht für die Wohnung.
    const arbeit: [number, number] = [8.6, 47.42];
    const k = privatzonenKreis(arbeit, 200, "u1", GEHEIMNIS);
    const versatzHaus = [basis.zentrum[0] - HAUS[0], basis.zentrum[1] - HAUS[1]];
    const versatzArbeit = [k.zentrum[0] - arbeit[0], k.zentrum[1] - arbeit[1]];
    expect(versatzArbeit).not.toEqual(versatzHaus);
  });

  it("bleibt in den Grenzen: Verschiebung ≤ r/2, Radius zwischen 1.5r und 2r", () => {
    for (let i = 0; i < 300; i++) {
      for (const r of [100, 200, 500]) {
        const k = privatzonenKreis(HAUS, r, `nutzer-${i}`, GEHEIMNIS);
        expect(meter(HAUS, k.zentrum)).toBeLessThanOrEqual(VERSCHIEBUNG_MAX_ANTEIL * r + 0.5);
        expect(k.radiusM).toBeGreaterThanOrEqual(RADIUS_MIN_FAKTOR * r);
        expect(k.radiusM).toBeLessThanOrEqual(RADIUS_MAX_FAKTOR * r);
      }
    }
  });

  it("verschiebt tatsächlich (nicht immer um nichts)", () => {
    const abstaende = Array.from({ length: 50 }, (_, i) =>
      meter(HAUS, privatzonenKreis(HAUS, 200, `n${i}`, GEHEIMNIS).zentrum),
    );
    expect(Math.max(...abstaende)).toBeGreaterThan(50);
  });
});

describe("verschleiertGekappt", () => {
  it("lässt den Track bei ausgeschalteter Privatzone unverändert", () => {
    const fahrt = fahrtAb(HAUS, 45);
    expect(verschleiertGekappt(fahrt, 0, "u1", GEHEIMNIS)).toEqual(fahrt);
  });

  it("hält die Zusage: kein sichtbarer Punkt näher als r am Start oder Ziel", () => {
    for (let i = 0; i < 100; i++) {
      for (const r of [100, 200, 500]) {
        const fahrt = rundfahrtAb(HAUS, (i * 37) % 360);
        const sichtbar = verschleiertGekappt(fahrt, r, `nutzer-${i}`, GEHEIMNIS);
        expect(sichtbar.length).toBeGreaterThan(1);
        for (const p of sichtbar) {
          expect(meter(p, fahrt[0])).toBeGreaterThanOrEqual(r);
          expect(meter(p, fahrt[fahrt.length - 1])).toBeGreaterThanOrEqual(r);
        }
      }
    }
  });

  it("schneidet höchstens bis 2.5 r weg — die Karte bleibt brauchbar", () => {
    const r = 200;
    const fahrt = fahrtAb(HAUS, 120);
    const sichtbar = verschleiertGekappt(fahrt, r, "u1", GEHEIMNIS);
    // +20 m: Punktabstand der Testfahrt.
    expect(meter(sichtbar[0], fahrt[0])).toBeLessThanOrEqual(
      (RADIUS_MAX_FAKTOR + VERSCHIEBUNG_MAX_ANTEIL) * r + 20,
    );
  });

  it("legt die ersten sichtbaren Punkte mehrerer Fahrten nicht auf einen Kreis um die Haustür", () => {
    // Der Angriff: Fahrten in verschiedene Richtungen, jeweils der erste
    // sichtbare Punkt. Mit der alten Kappung lagen alle in ~r Abstand zur
    // Haustür (Streuung nur durch den Punktabstand). Jetzt liegen sie auf
    // einem Kreis um den VERSCHOBENEN Mittelpunkt — ihr Abstand zur Haustür
    // schwankt deutlich, und der Kreismittelpunkt ist nicht die Haustür.
    const nutzer = "angriffsziel";
    const r = 200;
    const kreis = privatzonenKreis(HAUS, r, nutzer, GEHEIMNIS);
    const ersteSichtbare = [0, 90, 180, 270].map(
      (grad) => verschleiertGekappt(fahrtAb(HAUS, grad), r, nutzer, GEHEIMNIS)[0],
    );

    // Alle auf dem Kreis um den verschobenen Mittelpunkt (± Punktabstand) …
    for (const p of ersteSichtbare) {
      expect(Math.abs(meter(p, kreis.zentrum) - kreis.radiusM)).toBeLessThan(25);
    }
    // … und dieser Mittelpunkt ist nicht die Haustür. (Für diesen Nutzer
    // gewählt, weil seine Verschiebung spürbar ist; die Grenzen prüft der
    // Test oben.)
    expect(meter(kreis.zentrum, HAUS)).toBeGreaterThan(20);
  });

  it("verwirft eine Fahrt, die die Zone nie verlässt", () => {
    const kurz = fahrtAb(HAUS, 10, 0.3);
    expect(verschleiertGekappt(kurz, 200, "u1", GEHEIMNIS)).toEqual([]);
  });
});

describe("privatzonenGeheimnis", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("nimmt PRIVATZONE_SECRET vor dem Supabase-Schlüssel", () => {
    vi.stubEnv("PRIVATZONE_SECRET", "eigen");
    vi.stubEnv("SUPABASE_SECRET_KEY", "supabase");
    expect(privatzonenGeheimnis()).toBe("eigen");
  });

  it("fällt auf den Supabase-Schlüssel zurück", () => {
    vi.stubEnv("PRIVATZONE_SECRET", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "supabase");
    expect(privatzonenGeheimnis()).toBe("supabase");
  });

  it("liefert in Produktion ohne Geheimnis null statt eines bekannten Platzhalters", () => {
    vi.stubEnv("PRIVATZONE_SECRET", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(privatzonenGeheimnis()).toBeNull();
  });
});
