import { describe, it, expect } from "vitest";
import {
  einstiegsPfad,
  einstiegsUrl,
  findeCreatorLink,
  normalisiereCode,
  type CreatorLink,
} from "./creatorLinks";

const MAX: CreatorLink = {
  code: "max",
  name: "Max Muster",
  kanal: "tiktok",
  kampagne: "start26",
};

// Ohne Kampagne: der Normalfall, solange es nur einen Anlauf gibt.
const LEA: CreatorLink = { code: "lea-moto", name: "Lea", kanal: "instagram" };

const LINKS = [MAX, LEA];

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

describe("findeCreatorLink", () => {
  it("findet über den normalisierten Code", () => {
    expect(findeCreatorLink("MAX", LINKS)).toBe(MAX);
    expect(findeCreatorLink("lea-moto", LINKS)).toBe(LEA);
  });

  it("liefert null für einen unbekannten Code", () => {
    expect(findeCreatorLink("gibtsnicht", LINKS)).toBeNull();
  });

  it("liefert null für einen ungültigen Code, ohne die Liste zu befragen", () => {
    expect(findeCreatorLink("../max", LINKS)).toBeNull();
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
