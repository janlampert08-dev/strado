import { describe, expect, it } from "vitest";
import {
  ABDRUCK_LAENGE,
  GEHEIMNIS_LAENGE,
  abdruckVon,
  erzeugeGeheimnis,
  istGeheimnis,
  istTicketId,
  leseTicket,
  sollPulsen,
  PULS_INTERVALL_MS,
} from "./fahrtstart";

describe("erzeugeGeheimnis", () => {
  it("liefert 64 Hex-Zeichen", () => {
    const g = erzeugeGeheimnis();
    expect(g).toHaveLength(GEHEIMNIS_LAENGE);
    expect(g).toMatch(/^[0-9a-f]{64}$/);
  });

  it("wiederholt sich nicht", () => {
    const menge = new Set(Array.from({ length: 200 }, () => erzeugeGeheimnis()));
    expect(menge.size).toBe(200);
  });
});

describe("abdruckVon", () => {
  it("ist der SHA-256 des Geheimnisses als Hex", async () => {
    // Bekannter Vektor: SHA-256 von "abc".
    expect(await abdruckVon("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hat immer die Länge, die die Datenbank prüft", async () => {
    // 0096 lehnt jeden Abdruck ab, der nicht genau 64 Zeichen hat.
    for (const wert of ["", "a", erzeugeGeheimnis(), "ü".repeat(40)]) {
      expect(await abdruckVon(wert)).toHaveLength(ABDRUCK_LAENGE);
    }
  });

  it("ist Kleinbuchstaben-Hex — die Datenbank teilt danach auf", async () => {
    // 0096 prüft ^[0-9a-f]{64}$ und wählt aus den ersten zwei Zeichen einen
    // von 256 Mengenbremsen-Eimern. Grossbuchstaben würden dort abgewiesen,
    // und eine andere Kodierung würde die Eimer ungleich füllen.
    for (const wert of ["", "abc", erzeugeGeheimnis()]) {
      expect(await abdruckVon(wert)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("verteilt die ersten zwei Zeichen über die Eimer", async () => {
    // Nicht die Gleichverteilung von SHA-256 nachweisen — nur, dass echte
    // Gäste nicht alle im selben Eimer landen, was die Aufteilung aus 0096
    // wirkungslos machen würde.
    const eimer = new Set<string>();
    for (let i = 0; i < 200; i++) {
      eimer.add((await abdruckVon(erzeugeGeheimnis())).slice(0, 2));
    }
    expect(eimer.size).toBeGreaterThan(100);
  });

  it("ist deterministisch und unterscheidet benachbarte Eingaben", async () => {
    const a = erzeugeGeheimnis();
    expect(await abdruckVon(a)).toBe(await abdruckVon(a));
    expect(await abdruckVon(a)).not.toBe(await abdruckVon(`${a}0`));
  });

  it("gibt das Geheimnis nicht preis", async () => {
    // Der Abdruck ist das, was in der Datenbank liegt — er darf das
    // Geheimnis nicht enthalten, sonst wäre die Trennung sinnlos.
    const g = erzeugeGeheimnis();
    expect(await abdruckVon(g)).not.toContain(g.slice(0, 16));
  });
});

describe("istGeheimnis", () => {
  it("nimmt nur 64 Hex-Zeichen in Kleinschreibung", () => {
    expect(istGeheimnis(erzeugeGeheimnis())).toBe(true);
    expect(istGeheimnis("a".repeat(64))).toBe(true);
    expect(istGeheimnis("A".repeat(64))).toBe(false);
    expect(istGeheimnis("a".repeat(63))).toBe(false);
    expect(istGeheimnis("a".repeat(65))).toBe(false);
    expect(istGeheimnis("g".repeat(64))).toBe(false);
  });

  it("überlebt, was aus dem localStorage kommen kann", () => {
    for (const wert of [null, undefined, 0, {}, [], "null", "undefined"]) {
      expect(istGeheimnis(wert)).toBe(false);
    }
  });
});

describe("istTicketId", () => {
  it("nimmt eine UUID, sonst nichts", () => {
    expect(istTicketId("3f0f0f9e-4d1b-4f2a-9b7c-2d9a1b6e5c40")).toBe(true);
    expect(istTicketId("3f0f0f9e4d1b4f2a9b7c2d9a1b6e5c40")).toBe(false);
    expect(istTicketId("")).toBe(false);
    expect(istTicketId(null)).toBe(false);
  });
});

describe("leseTicket", () => {
  const gut = {
    id: "3f0f0f9e-4d1b-4f2a-9b7c-2d9a1b6e5c40",
    geheimnis: "a".repeat(64),
  };

  it("gibt ein vollständiges Ticket zurück", () => {
    expect(leseTicket(gut)).toEqual(gut);
  });

  it("gibt null zurück, sobald eine Hälfte fehlt oder kaputt ist", () => {
    expect(leseTicket({ ...gut, id: "kaputt" })).toBeNull();
    expect(leseTicket({ ...gut, geheimnis: "kurz" })).toBeNull();
    expect(leseTicket({ id: gut.id })).toBeNull();
    expect(leseTicket({ geheimnis: gut.geheimnis })).toBeNull();
  });

  it("gibt null zurück für alles, was kein Objekt ist", () => {
    // Ein alter Snapshot kennt das Feld gar nicht, ein beschädigter kann
    // alles enthalten. Beides muss zu "keine Zeitwertung" führen und nicht
    // zu einer Ausnahme mitten im Speichern einer echten Fahrt.
    for (const wert of [null, undefined, "", "null", 42, [], true]) {
      expect(leseTicket(wert)).toBeNull();
    }
  });

  it("ignoriert Zusatzfelder, statt daran zu scheitern", () => {
    expect(leseTicket({ ...gut, alt: "egal" })).toEqual(gut);
  });
});

describe("sollPulsen", () => {
  it("pulst sofort, solange noch kein Puls abgesetzt wurde", () => {
    expect(sollPulsen(null, 0)).toBe(true);
    expect(sollPulsen(null, 1_700_000_000_000)).toBe(true);
  });

  it("schweigt innerhalb des Intervalls", () => {
    const t = 1_700_000_000_000;
    expect(sollPulsen(t, t)).toBe(false);
    expect(sollPulsen(t, t + PULS_INTERVALL_MS - 1)).toBe(false);
  });

  it("pulst, sobald das Intervall voll ist", () => {
    const t = 1_700_000_000_000;
    expect(sollPulsen(t, t + PULS_INTERVALL_MS)).toBe(true);
    expect(sollPulsen(t, t + PULS_INTERVALL_MS * 3)).toBe(true);
  });

  // Die Datenbank weist Pulse ab, die enger als fünf Sekunden aufeinander
  // folgen (0098_fahrtstart_puls.sql). Läge das Client-Intervall darunter,
  // würde jeder zweite Puls still verworfen — und die Toleranz im Trigger
  // wäre auf eine Taktung ausgelegt, die es gar nicht gibt.
  it("bleibt deutlich über der Schreibbremse der Datenbank", () => {
    expect(PULS_INTERVALL_MS).toBeGreaterThan(5_000);
  });

  // Eine Uhr, die rückwärts läuft (Zeitumstellung, NTP-Korrektur), darf nicht
  // dazu führen, dass für Stunden gar nicht mehr gepulst wird.
  it("pulst nicht, wenn die Uhr zurückspringt — aber sperrt auch nicht dauerhaft", () => {
    const t = 1_700_000_000_000;
    expect(sollPulsen(t, t - 60_000)).toBe(false);
    expect(sollPulsen(t, t + PULS_INTERVALL_MS)).toBe(true);
  });
});
