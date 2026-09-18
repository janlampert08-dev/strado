import { describe, it, expect } from "vitest";
import {
  BESTAETIGUNG_COOKIE,
  BESTAETIGUNG_GUELTIG_SEKUNDEN,
  BESTAETIGUNG_PFAD,
  CODE_LAENGE,
  codeNormalisieren,
  emailAndeuten,
  offeneBestaetigungLesen,
  offeneBestaetigungPacken,
} from "./bestaetigung";

// Getestet wird die Auswertung, nicht der Cookie-Zugriff: merkeBestaetigung
// und Co. sind dünne Hüllen um next/headers und laufen nur im
// Request-Kontext — dieselbe Aufteilung wie in lib/herkunft.ts und
// lib/passwortWiederherstellung.ts.

describe("codeNormalisieren", () => {
  it("nimmt die acht Ziffern, die das Projekt verschickt", () => {
    expect(codeNormalisieren("12345678")).toBe("12345678");
  });

  // Der Fehler vom 2026-09-18: die Seite liess nur sechs Ziffern durch,
  // die E-Mail brachte acht. Jede Länge, die Supabase einstellen lässt,
  // muss durchgehen — sonst schaltet eine Änderung im Dashboard die
  // Registrierung still ab.
  it("nimmt jede Länge, die Supabase verschicken kann", () => {
    expect(codeNormalisieren("123456")).toBe("123456");
    expect(codeNormalisieren("1234567890")).toBe("1234567890");
  });

  // Der eigentliche Grund für die Funktion: so kommt ein aus der E-Mail
  // kopierter Code an.
  it("entfernt, was beim Kopieren mitkommt", () => {
    expect(codeNormalisieren(" 123 456 ")).toBe("123456");
    expect(codeNormalisieren("123-456")).toBe("123456");
    expect(codeNormalisieren("1234 5678")).toBe("12345678");
    expect(codeNormalisieren("123456\n")).toBe("123456");
    expect(codeNormalisieren(" 123456")).toBe("123456");
  });

  it("weist ab, was zu kurz oder zu lang für einen Code ist", () => {
    expect(codeNormalisieren("12345")).toBeNull();
    expect(codeNormalisieren("12345678901")).toBeNull();
    expect(codeNormalisieren("")).toBeNull();
    expect(codeNormalisieren("abcdef")).toBeNull();
  });

  // formData.get() liefert auch File und null — ohne die typeof-Prüfung
  // würde .replace() darauf werfen.
  it("weist alles ab, was kein String ist", () => {
    expect(codeNormalisieren(null)).toBeNull();
    expect(codeNormalisieren(undefined)).toBeNull();
    expect(codeNormalisieren(123456)).toBeNull();
    expect(codeNormalisieren(new File([], "code.txt"))).toBeNull();
  });

  it("hält die Länge und den Pfad fest, auf die drei Stellen zeigen", () => {
    expect(CODE_LAENGE).toBe(8);
    expect(BESTAETIGUNG_PFAD).toBe("/registrieren/bestaetigen");
    // Muss mit der Email-OTP-Expiration im Supabase-Projekt und mit dem Text
    // in supabase/email-vorlagen/bestaetigung.html übereinstimmen.
    expect(BESTAETIGUNG_GUELTIG_SEKUNDEN).toBe(3600);
  });
});

describe("Cookie-Eckdaten", () => {
  // Dieselbe Klammer wie in lib/herkunft.test.ts, und aus demselben Grund:
  // docs/rechtstexte/datenschutz.md und die veröffentlichte Fassung im Repo
  // stradoinfo nennen diesen Namen und diese Frist wörtlich. Ändert sich
  // hier etwas, ist das eine Rechtstext-Änderung in zwei Repositories und
  // kein Refactor — ohne diesen Test ginge sie stillschweigend durch.
  it("heisst wie in der Datenschutzerklärung genannt", () => {
    expect(BESTAETIGUNG_COOKIE).toBe("strado_bestaetigung");
    expect(BESTAETIGUNG_GUELTIG_SEKUNDEN).toBe(60 * 60);
  });
});

describe("offeneBestaetigungLesen", () => {
  it("liest zurück, was gepackt wurde", () => {
    const roh = offeneBestaetigungPacken(
      "fahrerin@example.com",
      "/fahrten/neu",
    );
    expect(offeneBestaetigungLesen(roh)).toEqual({
      email: "fahrerin@example.com",
      next: "/fahrten/neu",
    });
  });

  it("kommt ohne Rücksprungziel aus", () => {
    const roh = offeneBestaetigungPacken("fahrerin@example.com", null);
    expect(offeneBestaetigungLesen(roh)).toEqual({
      email: "fahrerin@example.com",
      next: null,
    });
  });

  // Der Kern: zwischen Schreiben und Lesen liegt ein Browser, den sein
  // Besitzer bearbeiten darf. Ein von Hand eingesetztes next darf kein
  // Open-Redirect werden — die Bestätigung endet in einem redirect().
  it("wirft ein fremdes Rücksprungziel weg, statt es zu übernehmen", () => {
    const manipuliert = JSON.stringify({
      email: "fahrerin@example.com",
      next: "//evil.example",
    });
    expect(offeneBestaetigungLesen(manipuliert)).toEqual({
      email: "fahrerin@example.com",
      next: null,
    });

    const absolut = JSON.stringify({
      email: "fahrerin@example.com",
      next: "https://evil.example",
    });
    expect(offeneBestaetigungLesen(absolut)?.next).toBeNull();
  });

  it("ergibt null, wenn nichts Brauchbares dasteht", () => {
    expect(offeneBestaetigungLesen(undefined)).toBeNull();
    expect(offeneBestaetigungLesen(null)).toBeNull();
    expect(offeneBestaetigungLesen("")).toBeNull();
    expect(offeneBestaetigungLesen("kein json")).toBeNull();
    expect(offeneBestaetigungLesen("null")).toBeNull();
    expect(offeneBestaetigungLesen('"nur ein string"')).toBeNull();
    expect(offeneBestaetigungLesen("{}")).toBeNull();
    expect(offeneBestaetigungLesen('{"email":42}')).toBeNull();
    expect(offeneBestaetigungLesen('{"email":"ohne-at"}')).toBeNull();
    expect(
      offeneBestaetigungLesen('{"email":"mit leer@example.com"}'),
    ).toBeNull();
  });

  it("weist eine überlange Adresse ab", () => {
    const lang = `${"a".repeat(250)}@example.com`;
    expect(offeneBestaetigungLesen(JSON.stringify({ email: lang }))).toBeNull();
  });
});

describe("emailAndeuten", () => {
  it("zeigt genug zum Wiedererkennen und nicht mehr", () => {
    expect(emailAndeuten("fahrerin@example.com")).toBe("fa******@example.com");
    expect(emailAndeuten("max.muster@bluewin.ch")).toBe("ma******@bluewin.ch");
  });

  // Bei zwei Zeichen wäre ein einziger Stern keine Andeutung mehr.
  it("verdeckt kurze Namen ganz", () => {
    expect(emailAndeuten("jo@example.com")).toBe("**@example.com");
    expect(emailAndeuten("a@example.com")).toBe("*@example.com");
  });

  it("lässt stehen, was gar keine Adresse ist", () => {
    expect(emailAndeuten("@example.com")).toBe("@example.com");
    expect(emailAndeuten("ohne-at")).toBe("ohne-at");
  });
});
