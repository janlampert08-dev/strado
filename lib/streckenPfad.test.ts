import { describe, expect, it } from "vitest";
import {
  AKZENTE_NACH,
  AKZENTE_VON,
  fehltSlugSpalte,
  istGueltigerSlug,
  istUuid,
  leseStreckenAdressteil,
  leseUuidStreckenseite,
  slugTeil,
  slugWeiterleitungsZiel,
  streckenPfad,
  streckenSlugBasis,
  SLUG_MAX_LAENGE,
} from "@/lib/streckenPfad";

const UUID = "1b8461e1-7eae-4262-82cf-c6827af63ae2";

describe("streckenSlugBasis (Spiegel von strecken_slug_basis in 0130)", () => {
  // Die Erwartungen sind nicht erfunden: dieselbe Regel wurde am 2026-09-25
  // als reine SELECT-Abfrage über die Produktionsdaten gerechnet, und das
  // hier sind ihre Ergebnisse. Weicht die TS-Fassung ab, weicht sie von der
  // SQL-Fassung ab.
  const faelle: [string, string, string, string][] = [
    ["Ächerlipass", "Kerns", "Dallenwil", "aecherlipass-kerns-dallenwil"],
    ["Flüelapass", "Davos", "Susch", "flueelapass-davos-susch"],
    ["Albulapass", "Bergün", "La Punt Chamues-ch", "albulapass-berguen-la-punt-chamues-ch"],
    ["Gotthardpass (Tremola)", "Airolo", "Hospental", "gotthardpass-tremola-airolo-hospental"],
    ["Col des Mosses", "Aigle", "Château-d'Oex", "col-des-mosses-aigle-chateau-d-oex"],
    ["San-Bernardino-Passstrasse", "Hinterrhein", "S. Bernardino", "san-bernardino-passstrasse-hinterrhein-s-bernardino"],
    ["Ofenpass", "Zernez", "Sta. Maria Val Müstair", "ofenpass-zernez-sta-maria-val-muestair"],
    ["Schwägalppass", "Neu St. Johann", "Urnäsch", "schwaegalppass-neu-st-johann-urnaesch"],
    ["Etzelpass", "Pfäffikon SZ", "Einsiedeln", "etzelpass-pfaeffikon-sz-einsiedeln"],
    // Rundfahrten: Start- gleich Zielort, ohne Rücksicht auf Grossschreibung.
    ["Zürichsee Run", "Zürich", "Zürich", "zuerichsee-run-rundfahrt-ab-zuerich"],
    ["Albis Loop", "Langnau am Albis", "Langnau am Albis", "albis-loop-rundfahrt-ab-langnau-am-albis"],
    ["Grosser St. Bernhard", "Bourg-St-Pierre", "Bourg-St-Pierre", "grosser-st-bernhard-rundfahrt-ab-bourg-st-pierre"],
    ["Witikon Windings", "Zürich", " zürich ", "witikon-windings-rundfahrt-ab-zuerich"],
  ];

  it.each(faelle)("%s (%s → %s)", (name, start, ziel, erwartet) => {
    expect(streckenSlugBasis(name, start, ziel)).toBe(erwartet);
  });

  it("schreibt Grossbuchstaben mit Umlaut und übrige Akzente um", () => {
    expect(slugTeil("ÄÖÜ ß éèê ñ ç Œuvre")).toBe("aeoeue-ss-eee-n-c-oeuvre");
  });

  it("fällt bei einem leeren Namen auf 'strecke' zurück", () => {
    expect(streckenSlugBasis("!!!", "Kerns", "Dallenwil")).toBe("strecke-kerns-dallenwil");
    expect(streckenSlugBasis("", "", "")).toBe("strecke");
  });

  it("lässt leere Orte weg statt doppelte Bindestriche zu setzen", () => {
    expect(streckenSlugBasis("Pass", "", "Ziel")).toBe("pass-ziel");
  });

  it("schneidet über 60 Zeichen am letzten Bindestrich ab", () => {
    const slug = streckenSlugBasis(
      "Eine ausserordentlich lange Panoramastrasse",
      "Oberdorf im Tal",
      "Unterdorf am Berg",
    );
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LAENGE);
    expect(slug).toBe("eine-ausserordentlich-lange-panoramastrasse-oberdorf-im-tal");
    expect(slug.endsWith("-")).toBe(false);
  });

  it("schneidet ein einziges überlanges Wort hart ab", () => {
    const slug = streckenSlugBasis("a".repeat(80), "x", "y");
    expect(slug).toBe("a".repeat(SLUG_MAX_LAENGE));
  });

  it("erzeugt immer die Form, die die Check-Constraint verlangt", () => {
    for (const [name, start, ziel] of faelle) {
      expect(streckenSlugBasis(name, start, ziel)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("hat eine vollständige Akzenttabelle (translate() braucht gleich lange Listen)", () => {
    expect([...AKZENTE_VON].length).toBe([...AKZENTE_NACH].length);
  });
});

describe("UUID oder Slug", () => {
  it("erkennt UUIDs, auch grossgeschrieben", () => {
    expect(istUuid(UUID)).toBe(true);
    expect(istUuid(UUID.toUpperCase())).toBe(true);
    expect(istUuid("aecherlipass-kerns-dallenwil")).toBe(false);
  });

  it("liest das Segment von /strecken/[id]", () => {
    expect(leseStreckenAdressteil(UUID)).toEqual({ art: "id", wert: UUID });
    expect(leseStreckenAdressteil(UUID.toUpperCase())).toEqual({ art: "id", wert: UUID });
    expect(leseStreckenAdressteil("aecherlipass-kerns-dallenwil")).toEqual({
      art: "slug",
      wert: "aecherlipass-kerns-dallenwil",
    });
    expect(leseStreckenAdressteil("furkapass-oberwald-realp-2")).toEqual({
      art: "slug",
      wert: "furkapass-oberwald-realp-2",
    });
  });

  it("weist ab, was weder UUID noch Slug sein kann — ohne Datenbankabfrage", () => {
    for (const falsch of [
      "",
      "Aecherlipass",
      "aecherlipass--kerns",
      "-aecherlipass",
      "aecherlipass-",
      "äch",
      "a b",
      "x".repeat(71),
    ]) {
      expect(leseStreckenAdressteil(falsch)).toBeNull();
    }
  });

  it("zählt eine UUID nie als Slug", () => {
    expect(istGueltigerSlug(UUID)).toBe(false);
  });
});

describe("streckenPfad", () => {
  it("nimmt den Slug, wenn es einen gibt", () => {
    expect(streckenPfad({ id: UUID, slug: "aecherlipass-kerns-dallenwil" })).toBe(
      "/strecken/aecherlipass-kerns-dallenwil",
    );
  });

  it("fällt ohne Slug (vor 0130, nicht freigegeben) auf die UUID zurück", () => {
    expect(streckenPfad({ id: UUID })).toBe(`/strecken/${UUID}`);
    expect(streckenPfad({ id: UUID, slug: null })).toBe(`/strecken/${UUID}`);
    expect(streckenPfad({ id: UUID, slug: "" })).toBe(`/strecken/${UUID}`);
  });

  it("verlinkt nie einen Slug, den die Seite nicht wieder auflösen würde", () => {
    expect(streckenPfad({ id: UUID, slug: "../admin" })).toBe(`/strecken/${UUID}`);
  });
});

describe("Weiterleitung alter UUID-Adressen (proxy.ts)", () => {
  it("erkennt die Streckenseite und /bearbeiten", () => {
    expect(leseUuidStreckenseite(`/strecken/${UUID}`)).toEqual({ id: UUID, unterpfad: "" });
    expect(leseUuidStreckenseite(`/strecken/${UUID}/`)).toEqual({ id: UUID, unterpfad: "" });
    expect(leseUuidStreckenseite(`/strecken/${UUID}/bearbeiten`)).toEqual({
      id: UUID,
      unterpfad: "/bearbeiten",
    });
  });

  it("lässt Bild, Geometrie, Slug-Adressen und alles andere in Ruhe", () => {
    expect(leseUuidStreckenseite(`/strecken/${UUID}/opengraph-image`)).toBeNull();
    expect(leseUuidStreckenseite(`/strecken/${UUID}/geometrie`)).toBeNull();
    expect(leseUuidStreckenseite("/strecken/aecherlipass-kerns-dallenwil")).toBeNull();
    expect(leseUuidStreckenseite("/strecken/neu")).toBeNull();
    expect(leseUuidStreckenseite(`/api/strecken/${UUID}`)).toBeNull();
    expect(leseUuidStreckenseite(`/fahrten/${UUID}`)).toBeNull();
  });

  it("behält Unterpfad und Query (?fortsetzen=, ?privat=)", () => {
    expect(slugWeiterleitungsZiel("", "?fortsetzen=abc", "aecherlipass-kerns-dallenwil")).toBe(
      "/strecken/aecherlipass-kerns-dallenwil?fortsetzen=abc",
    );
    expect(slugWeiterleitungsZiel("/bearbeiten", "", "aecherlipass-kerns-dallenwil")).toBe(
      "/strecken/aecherlipass-kerns-dallenwil/bearbeiten",
    );
  });

  it("leitet ohne gültigen Slug nicht weiter", () => {
    expect(slugWeiterleitungsZiel("", "", null)).toBeNull();
    expect(slugWeiterleitungsZiel("", "", undefined)).toBeNull();
    expect(slugWeiterleitungsZiel("", "", "//boese.example")).toBeNull();
  });
});

describe("fehltSlugSpalte", () => {
  it("erkennt die fehlende Spalte vor 0130", () => {
    expect(fehltSlugSpalte({ code: "42703", message: "column routes_geojson.slug does not exist" })).toBe(true);
    expect(fehltSlugSpalte({ message: "column routes.slug does not exist" })).toBe(true);
  });

  it("verwechselt andere Fehler nicht damit", () => {
    expect(fehltSlugSpalte(null)).toBe(false);
    expect(fehltSlugSpalte({ code: "42703", message: "column routes_geojson.foo does not exist" })).toBe(false);
    expect(fehltSlugSpalte({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(fehltSlugSpalte({ code: "42703", message: "column routes_geojson.slugger does not exist" })).toBe(false);
  });
});
