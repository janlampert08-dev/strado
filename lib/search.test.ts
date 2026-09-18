import { describe, expect, it } from "vitest";
import { brauchtUrlSync, istFremderSuchtext, matchesSearch } from "@/lib/search";
import type { RouteGeoJSON } from "@/types/database";

function makeRoute(overrides: Partial<RouteGeoJSON> = {}): RouteGeoJSON {
  return {
    id: "test-id",
    name: "Julierpass",
    region: "Graubünden",
    start_ort: "Tiefencastel",
    ziel_ort: "Silvaplana",
    start_geojson: { type: "Point", coordinates: [9.5, 46.65] },
    ziel_geojson: { type: "Point", coordinates: [9.8, 46.47] },
    geometry_geojson: { type: "LineString", coordinates: [[9.5, 46.65], [9.8, 46.47]] },
    hoehe_m: 2283,
    laenge_km: 37.9,
    max_steigung_prozent: 12,
    kehren: 26,
    kategorien: ["passstrasse"],
    saison_status: "saisonal",
    status_ok: true,
    charakter_text: null,
    tempolimits: null,
    hoehenprofil: null,
    ist_rundfahrt: false,
    erstellt_von: null,
    created_at: new Date().toISOString(),
    ist_privat: false,
    ...overrides,
  };
}

describe("matchesSearch", () => {
  const route = makeRoute();

  it("matches an empty query unconditionally", () => {
    expect(matchesSearch(route, "")).toBe(true);
    expect(matchesSearch(route, "   ")).toBe(true);
  });

  it("matches case-insensitively on the route name", () => {
    expect(matchesSearch(route, "julier")).toBe(true);
    expect(matchesSearch(route, "JULIER")).toBe(true);
  });

  it("matches on region, start, and destination", () => {
    expect(matchesSearch(route, "Graubünden")).toBe(true);
    expect(matchesSearch(route, "Tiefencastel")).toBe(true);
    expect(matchesSearch(route, "Silvaplana")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(matchesSearch(route, "Zürich")).toBe(false);
  });

  it("ignores diacritics in query and route", () => {
    expect(matchesSearch(route, "graubunden")).toBe(true);
    expect(matchesSearch(makeRoute({ start_ort: "Neuchâtel" }), "neuchatel")).toBe(true);
    expect(matchesSearch(makeRoute({ region: "Zurich" }), "Zürich")).toBe(true);
  });
});

describe("istFremderSuchtext", () => {
  it("hält jeden Wert für fremd, solange nichts geschrieben wurde", () => {
    expect(istFremderSuchtext("furka", null)).toBe(true);
    expect(istFremderSuchtext("", null)).toBe(true);
  });

  it("erkennt das Echo des eigenen Schreibvorgangs", () => {
    expect(istFremderSuchtext("furka", "furka")).toBe(false);
  });

  it("erkennt Zurück/Vorwärts auf einen anderen Suchtext als fremd", () => {
    expect(istFremderSuchtext("julier", "furka")).toBe(true);
  });

  it("erkennt das Echo des geleerten Feldes", () => {
    // Feld geleert → geschrieben wird "" (URL ganz ohne ?q=), und das Echo
    // darf die Eingabe genauso wenig anfassen wie jedes andere.
    expect(istFremderSuchtext("", "")).toBe(false);
  });
});

describe("brauchtUrlSync", () => {
  it("verlangt einen Sync, solange die URL hinterherhinkt", () => {
    expect(brauchtUrlSync("furka", "")).toBe(true);
    expect(brauchtUrlSync("furkas", "furka")).toBe(true);
    expect(brauchtUrlSync("", "furka")).toBe(true);
  });

  it("ist zufrieden, sobald die URL den Suchtext trägt", () => {
    expect(brauchtUrlSync("furka", "furka")).toBe(false);
    expect(brauchtUrlSync("", "")).toBe(false);
  });

  it("vergleicht getrimmt, damit Leerzeichen keine Schreibschleife auslösen", () => {
    // searchQueryHref() trimmt beim Schreiben. Ohne Trimmen hier bliebe
    // "furka " gegenüber ?q=furka dauerhaft ungleich — der debounced Effekt
    // schriebe denselben Wert dann alle 300 ms erneut.
    expect(brauchtUrlSync("furka ", "furka")).toBe(false);
    expect(brauchtUrlSync("  furka", "furka")).toBe(false);
    expect(brauchtUrlSync("   ", "")).toBe(false);
  });
});
