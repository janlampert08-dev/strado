import { describe, it, expect } from "vitest";
import {
  HERKUNFT_COOKIE,
  HERKUNFT_COOKIE_OPTIONEN,
  HERKUNFT_GUELTIG_SEKUNDEN,
  herkunftCookieWert,
} from "./herkunft";

// Getestet wird hier die Geschäftsregel, nicht der Cookie-Zugriff: die
// Entscheidung "wird überschrieben oder nicht" ist das, woran eine falsche
// Zuordnung hängt. leseHerkunft/verbraucheHerkunft sind dünne Hüllen um
// next/headers und laufen nur im Request-Kontext — dieselbe Aufteilung wie
// in lib/passwortWiederherstellung.ts.
describe("herkunftCookieWert", () => {
  it("schreibt den Code, wenn noch keiner dasteht", () => {
    expect(herkunftCookieWert(undefined, "max")).toBe("max");
    expect(herkunftCookieWert(null, "max")).toBe("max");
    expect(herkunftCookieWert("", "max")).toBe("max");
  });

  // Der Kern: First Touch gewinnt. Wer jemanden auf die App aufmerksam
  // gemacht hat, behält die Zuordnung auch dann, wenn der Besucher später
  // über einen anderen Link hereinkommt.
  it("lässt einen vorhandenen Code unangetastet", () => {
    expect(herkunftCookieWert("lea-moto", "max")).toBeNull();
  });

  it("lässt ihn auch dann stehen, wenn derselbe Code nochmal kommt", () => {
    expect(herkunftCookieWert("max", "max")).toBeNull();
  });

  // Ein httpOnly-Cookie ist vor fremdem JS geschützt, nicht vor dem
  // Besitzer des Browsers. Was dort steht, kann Unsinn sein — dann darf es
  // die Zuordnung nicht für 90 Tage blockieren.
  it("überschreibt einen unsinnigen vorhandenen Wert", () => {
    for (const kaputt of [
      "max/admin",
      "../etc",
      "ma x",
      "m",
      "x".repeat(33),
      "MAX!",
    ]) {
      expect(herkunftCookieWert(kaputt, "lea-moto")).toBe("lea-moto");
    }
  });

  // Gross geschrieben aus einem Video abgetippt ist derselbe Creator —
  // dieselbe Normalisierung wie in /c/<code> selbst.
  it("normalisiert beim Schreiben und beim Vergleichen", () => {
    expect(herkunftCookieWert(null, "MAX")).toBe("max");
    expect(herkunftCookieWert("  MAX  ", "lea-moto")).toBeNull();
  });

  it("schreibt nichts, wenn der neue Code selbst ungültig ist", () => {
    expect(herkunftCookieWert(null, "max/admin")).toBeNull();
    expect(herkunftCookieWert(null, "")).toBeNull();
  });
});

describe("Cookie-Eckdaten", () => {
  it("heisst wie in der Datenschutzerklärung genannt", () => {
    // docs/rechtstexte/datenschutz.md und die veröffentlichte Fassung im
    // Repo stradoinfo nennen diesen Namen und diese Frist wörtlich. Ändert
    // sich hier etwas, ist das eine Rechtstext-Änderung und kein Refactor.
    expect(HERKUNFT_COOKIE).toBe("strado_herkunft");
    expect(HERKUNFT_GUELTIG_SEKUNDEN).toBe(60 * 60 * 24 * 90);
  });

  // Die Datei begründet httpOnly über einen ganzen Absatz ("was der
  // Browser-JS nicht sieht, kann ein XSS nicht auslesen") — ohne diesen
  // Test ginge ein Refactor, der es fallen lässt, grün durch. sameSite
  // und path stehen aus demselben Grund dabei: lax trägt den Klick aus
  // dem TikTok-Browser, und ein weiterer path böte einer Nachbar-Origin
  // eine zweite Stelle zum Schreiben.
  it("bleibt bei den Cookie-Eigenschaften, die die Datei begründet", () => {
    expect(HERKUNFT_COOKIE_OPTIONEN).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: HERKUNFT_GUELTIG_SEKUNDEN,
    });
  });

  // secure ist umgebungsabhängig (http auf localhost), deshalb hier nur
  // die Zusicherung, dass es überhaupt an der Umgebung hängt und nicht
  // versehentlich hart auf false steht.
  it("setzt secure aus der Umgebung", () => {
    expect(HERKUNFT_COOKIE_OPTIONEN.secure).toBe(
      process.env.NODE_ENV === "production",
    );
  });
});
