import { describe, expect, it } from "vitest";
import {
  BAHN_TEMPO_KMH,
  bewerteBewegungsprofil,
  type BewegungsPunkt,
} from "@/lib/bewegungsprofil";

// Erzeugt einen Track aus Tempo- und Kursverlauf. Beides als Funktion der
// bereits gefahrenen Distanz, damit sich eine kurvige Bergstrasse, eine
// Autobahnetappe und eine Bahnlinie mit demselben Generator bauen lassen —
// analog zu driveSegment() in lib/lapDetection.test.ts.
function erzeugeTrack({
  start = [8.5, 47.37] as [number, number],
  startSekunden = 0,
  dauerSekunden,
  schrittSekunden = 5,
  tempo,
  kurs,
}: {
  start?: [number, number];
  startSekunden?: number;
  dauerSekunden: number;
  schrittSekunden?: number;
  /** km/h an der Stelle "km" (0 = Halt). */
  tempo: (km: number, sekunde: number) => number;
  /** Fahrtrichtung in Grad an der Stelle "km". */
  kurs: (km: number) => number;
}): BewegungsPunkt[] {
  const punkte: BewegungsPunkt[] = [];
  let [lng, lat] = start;
  let km = 0;
  for (let s = 0; s <= dauerSekunden; s += schrittSekunden) {
    punkte.push({ lng, lat, t: (startSekunden + s) * 1000 });
    const kmh = tempo(km, s);
    const schrittKm = (kmh * schrittSekunden) / 3600;
    const rad = (kurs(km) * Math.PI) / 180;
    lat += (schrittKm / 111.32) * Math.cos(rad);
    lng += (schrittKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(rad);
    km += schrittKm;
  }
  return punkte;
}

// Kurvige Bergstrasse: 45 Minuten mit 45 km/h und ständigen Richtungs-
// wechseln (Kehren) — der Fall, der unter keinen Umständen abgelehnt werden
// darf.
function bergstrasse(): BewegungsPunkt[] {
  return erzeugeTrack({
    dauerSekunden: 45 * 60,
    tempo: () => 45,
    kurs: (km) => 90 + 130 * Math.sin(km * 9),
  });
}

// Autobahnetappe: eine Stunde, im Mittel 125 km/h mit Verkehrsschwankungen
// (115..135) und der sanften Linienführung einer Autobahn. Legitim, schnell
// und praktisch kurvenfrei — genau die Kombination, bei der eine zu scharfe
// Erkennung falsch-positiv würde.
function autobahnetappe(): BewegungsPunkt[] {
  return erzeugeTrack({
    dauerSekunden: 60 * 60,
    tempo: (km) => 125 + 10 * Math.sin(km * 1.7),
    kurs: (km) => 90 + 8 * Math.sin(km * 0.4),
  });
}

// Bahnfahrt: 45 Minuten mit 165 km/h, ein Zwischenhalt von einer Minute,
// nahezu gerade Linienführung.
function bahnfahrt(): BewegungsPunkt[] {
  return erzeugeTrack({
    dauerSekunden: 45 * 60,
    tempo: (_km, sekunde) => (sekunde > 1200 && sekunde <= 1260 ? 0 : 165),
    kurs: (km) => 90 + 4 * Math.sin(km * 0.08),
  });
}

// Flug: 20 Minuten Reiseflug mit 800 km/h.
function flug(): BewegungsPunkt[] {
  return erzeugeTrack({
    dauerSekunden: 20 * 60,
    schrittSekunden: 10,
    tempo: () => 800,
    kurs: () => 45,
  });
}

describe("bewerteBewegungsprofil", () => {
  it("lässt eine kurvige Bergstrecke durch", () => {
    const profil = bewerteBewegungsprofil(bergstrasse());
    expect(profil.plausibel).toBe(true);
    expect(profil.art).toBe("strassenfahrzeug");
    // Die Kurvigkeit ist das Sicherheitsnetz gegen Falsch-Positive: eine
    // Passstrasse liegt um Grössenordnungen über der Bahn-Schwelle.
    expect(profil.kennzahlen.kurvigkeitGradProKm).toBeGreaterThan(100);
  });

  it("lässt eine schnelle Autobahnetappe durch", () => {
    const profil = bewerteBewegungsprofil(autobahnetappe());
    expect(profil.plausibel).toBe(true);
    expect(profil.art).toBe("strassenfahrzeug");
    expect(profil.kennzahlen.zeitanteilUeberBahnTempo).toBeLessThan(0.5);
    expect(profil.kennzahlen.distanzKm).toBeGreaterThan(100);
  });

  it("erkennt eine Bahnfahrt und begruendet sie", () => {
    const profil = bewerteBewegungsprofil(bahnfahrt());
    expect(profil.art).toBe("bahn");
    expect(profil.plausibel).toBe(false);
    expect(profil.begruendung).toContain(`${BAHN_TEMPO_KMH} km/h`);
    expect(profil.kennzahlen.zeitanteilUeberBahnTempo).toBeGreaterThan(0.9);
  });

  it("erkennt einen Flug als Flug, nicht als Bahnfahrt", () => {
    const profil = bewerteBewegungsprofil(flug());
    expect(profil.art).toBe("flug");
    expect(profil.plausibel).toBe(false);
    expect(profil.begruendung).toContain("Flug");
  });

  it("lehnt wegen eines einzelnen GPS-Ausreissers nicht ab", () => {
    const punkte = bergstrasse();
    const mitte = Math.floor(punkte.length / 2);
    // Ein einzelner Fix springt gut 1.5 km daneben und wieder zurück —
    // rechnerisch kurzzeitig mehrere hundert km/h.
    const ausreisser: BewegungsPunkt[] = punkte.map((p, i) =>
      i === mitte ? { ...p, lat: p.lat + 0.0135 } : p,
    );
    const profil = bewerteBewegungsprofil(ausreisser);
    expect(profil.plausibel).toBe(true);
    expect(profil.kennzahlen.sekundenUeberFlugTempo).toBeLessThan(120);
  });

  it("ignoriert einen Sprung ueber der Ausreisser-Grenze in der Tempostatistik", () => {
    const punkte = autobahnetappe();
    const mitte = Math.floor(punkte.length / 2);
    // 10 km Versatz in fünf Sekunden: als Segment verworfen, statt als
    // Flugtempo gezählt zu werden.
    const mitSprung: BewegungsPunkt[] = punkte.map((p, i) =>
      i >= mitte ? { ...p, lat: p.lat + 0.09 } : p,
    );
    const profil = bewerteBewegungsprofil(mitSprung);
    expect(profil.plausibel).toBe(true);
    expect(profil.kennzahlen.sekundenUeberFlugTempo).toBe(0);
  });

  it("fällt bei einer zu kurzen Aufzeichnung kein Urteil", () => {
    const kurz = erzeugeTrack({ dauerSekunden: 45, tempo: () => 30, kurs: () => 0 });
    const profil = bewerteBewegungsprofil(kurz);
    expect(profil.art).toBe("unbestimmt");
    expect(profil.plausibel).toBe(true);
    expect(profil.begruendung).toBeNull();
  });

  it("fällt bei einem leeren Trail kein Urteil", () => {
    const profil = bewerteBewegungsprofil([]);
    expect(profil.art).toBe("unbestimmt");
    expect(profil.plausibel).toBe(true);
  });

  it("lässt eine kurze schnelle Etappe durch (zu wenig Distanz fuer ein Bahn-Urteil)", () => {
    // Dieselbe Signatur wie eine Bahnfahrt, aber nur über 8 km: unterhalb
    // der Mindestdistanz wird bewusst nicht abgelehnt.
    const kurzeEtappe = erzeugeTrack({
      dauerSekunden: 4 * 60,
      tempo: () => 160,
      kurs: () => 90,
    });
    const profil = bewerteBewegungsprofil(kurzeEtappe);
    expect(profil.plausibel).toBe(true);
  });

  it("ignoriert Punkte mit schlechter GPS-Genauigkeit in der Tempostatistik", () => {
    const punkte = bahnfahrt().map((p) => ({ ...p, acc: 120 }));
    const profil = bewerteBewegungsprofil(punkte);
    // Ohne verwertbare Segmente bleibt nichts, worauf sich ein Urteil
    // stützen liesse.
    expect(profil.art).toBe("unbestimmt");
    expect(profil.plausibel).toBe(true);
  });
});
