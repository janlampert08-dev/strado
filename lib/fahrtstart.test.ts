import { describe, expect, it } from "vitest";
import {
  ABDRUCK_LAENGE,
  GEHEIMNIS_LAENGE,
  abdruckVon,
  erzeugeGeheimnis,
  istGeheimnis,
  istTicketId,
  leseTicket,
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
