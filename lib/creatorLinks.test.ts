import { describe, it, expect } from "vitest";
import {
  einstiegsPfad,
  einstiegsUrl,
  normalisiereCode,
  pruefeCreatorLinkEingabe,
} from "./creatorLinks";
import type { CreatorLinkZiel } from "@/types/database";

const MAX: CreatorLinkZiel = { code: "max", kanal: "tiktok", kampagne: "start26" };

// Ohne Kampagne: der Normalfall, solange es nur einen Anlauf gibt.
const LEA: CreatorLinkZiel = { code: "lea-moto", kanal: "instagram", kampagne: null };

describe("normalisiereCode", () => {
  it("nimmt einen einfachen Code an", () => {
    expect(normalisiereCode("max")).toBe("max");
  });

  it("schreibt klein und schneidet Leerraum ab", () => {
    expect(normalisiereCode("  MAX  ")).toBe("max");
  });

  it("erlaubt Ziffern und Bindestriche", () => {
    expect(normalisiereCode("lea-moto-2")).toBe("lea-moto-2");
  });

  it("weist zu kurze und zu lange Codes ab", () => {
    expect(normalisiereCode("m")).toBeNull();
    expect(normalisiereCode("m".repeat(33))).toBeNull();
  });

  // Ein Code wandert unverändert in eine URL und in die Auswertung. Alles,
  // was dort eine Sonderbedeutung hat, gehört vorher abgewiesen und nicht
  // bereinigt — dieselbe Haltung wie in safeInternalPath().
  it("weist alles ab, was in einer URL eine Sonderbedeutung hat", () => {
    for (const roh of ["max/admin", "../etc", "max?x=1", "max#a", "ma x", "max.1", "max%2F"]) {
      expect(normalisiereCode(roh)).toBeNull();
    }
  });

  it("weist Leeres und Nicht-Strings ab", () => {
    expect(normalisiereCode("")).toBeNull();
    expect(normalisiereCode(null)).toBeNull();
    expect(normalisiereCode(undefined)).toBeNull();
  });
});

describe("einstiegsPfad", () => {
  it("landet ohne Ziel auf der Startseite und trägt die UTM-Parameter", () => {
    const pfad = einstiegsPfad(MAX);
    const url = new URL(pfad, "https://app.strado.test");

    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("utm_source")).toBe("tiktok");
    expect(url.searchParams.get("utm_medium")).toBe("creator");
    expect(url.searchParams.get("utm_campaign")).toBe("start26");
    // Der Creator steht in utm_content — danach wird gruppiert.
    expect(url.searchParams.get("utm_content")).toBe("max");
  });

  it("lässt utm_campaign weg, wenn der Link keine Kampagne hat", () => {
    const url = new URL(einstiegsPfad(LEA), "https://app.strado.test");
    expect(url.searchParams.has("utm_campaign")).toBe(false);
    expect(url.searchParams.get("utm_source")).toBe("instagram");
  });

  it("nimmt einen internen Tiefenlink an", () => {
    const url = new URL(einstiegsPfad(MAX, "/strecken/abc"), "https://app.strado.test");
    expect(url.pathname).toBe("/strecken/abc");
    expect(url.searchParams.get("utm_content")).toBe("max");
  });

  it("behält einen vorhandenen Query-String des Ziels", () => {
    const url = new URL(einstiegsPfad(MAX, "/feed?tab=folge"), "https://app.strado.test");
    expect(url.searchParams.get("tab")).toBe("folge");
    expect(url.searchParams.get("utm_content")).toBe("max");
  });

  // Sonst könnte ein präpariertes ?z= die Zuordnung auf einen fremden Code
  // umbiegen — der Klick zählte für jemand anderen.
  it("überschreibt UTM-Parameter, die schon im Ziel stehen", () => {
    const url = new URL(einstiegsPfad(MAX, "/?utm_content=fremd"), "https://app.strado.test");
    expect(url.searchParams.getAll("utm_content")).toEqual(["max"]);
  });

  // safeInternalPath() ist der Open-Redirect-Schutz der App; hier nur die
  // Bestätigung, dass er auf diesem Weg tatsächlich greift.
  it("fällt bei einem externen oder protokollrelativen Ziel auf / zurück", () => {
    for (const ziel of ["https://boese.example", "//boese.example", "/\\boese.example", "/\tx"]) {
      const url = new URL(einstiegsPfad(MAX, ziel), "https://app.strado.test");
      expect(url.pathname).toBe("/");
    }
  });
});

describe("einstiegsUrl", () => {
  it("setzt den Pfad an die Basis", () => {
    expect(einstiegsUrl("https://app.strado.ch", "max")).toBe("https://app.strado.ch/c/max");
  });

  it("erzeugt keinen doppelten Schrägstrich", () => {
    expect(einstiegsUrl("https://app.strado.ch/", "max")).toBe("https://app.strado.ch/c/max");
  });
});

describe("pruefeCreatorLinkEingabe", () => {
  const gueltig = { code: "max", name: "Max Muster", kanal: "tiktok", kampagne: "start26" };

  it("nimmt eine vollständige Eingabe an", () => {
    const ergebnis = pruefeCreatorLinkEingabe(gueltig);
    expect(ergebnis).toEqual({ ok: true, wert: gueltig });
  });

  it("normalisiert Code und Kanal und schneidet den Namen", () => {
    const ergebnis = pruefeCreatorLinkEingabe({
      code: " MAX ",
      name: "  Max Muster  ",
      kanal: " TikTok ",
      kampagne: " Start26 ",
    });
    expect(ergebnis).toEqual({
      ok: true,
      wert: { code: "max", name: "Max Muster", kanal: "tiktok", kampagne: "start26" },
    });
  });

  // Leer heisst "keine Kampagne". Sonst stünde ein utm_campaign= ohne Wert
  // in jeder Adresse dieses Creators.
  it("macht aus einer leeren Kampagne null", () => {
    for (const kampagne of ["", "   ", null, undefined]) {
      const ergebnis = pruefeCreatorLinkEingabe({ ...gueltig, kampagne });
      expect(ergebnis).toMatchObject({ ok: true, wert: { kampagne: null } });
    }
  });

  it("weist einen ungültigen Code ab", () => {
    for (const code of ["", "m", "max/admin", "Max Muster", "max.1", "m".repeat(33)]) {
      expect(pruefeCreatorLinkEingabe({ ...gueltig, code })).toMatchObject({ ok: false });
    }
  });

  it("weist einen fehlenden Namen ab", () => {
    for (const name of ["", "   ", null]) {
      expect(pruefeCreatorLinkEingabe({ ...gueltig, name })).toMatchObject({ ok: false });
    }
  });

  it("weist einen zu langen Namen ab", () => {
    expect(pruefeCreatorLinkEingabe({ ...gueltig, name: "a".repeat(81) })).toMatchObject({
      ok: false,
    });
  });

  it("weist einen ungültigen Kanal ab", () => {
    for (const kanal of ["", "t", "tik tok", "tiktok!", "a".repeat(33)]) {
      expect(pruefeCreatorLinkEingabe({ ...gueltig, kanal })).toMatchObject({ ok: false });
    }
  });

  it("weist eine ungültige Kampagne ab", () => {
    expect(pruefeCreatorLinkEingabe({ ...gueltig, kampagne: "start 26" })).toMatchObject({
      ok: false,
    });
  });

  // Der geprüfte Wert geht unverändert in die Tabelle. Was hier durchkommt,
  // muss deshalb auch die CHECK-Constraints aus 0080 erfüllen — sonst wäre
  // die Fehlermeldung ein roher PostgREST-Fehler.
  it("liefert nur Werte, die zu den CHECK-Constraints aus 0080 passen", () => {
    const ergebnis = pruefeCreatorLinkEingabe({
      code: "LEA-Moto-2",
      name: "Lea",
      kanal: "INSTAGRAM",
      kampagne: null,
    });
    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(ergebnis.wert.code).toMatch(/^[a-z0-9-]{2,32}$/);
    expect(ergebnis.wert.kanal).toMatch(/^[a-z0-9_-]{2,32}$/);
  });
});
