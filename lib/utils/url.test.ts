import { describe, it, expect } from "vitest";
import { safeInternalPath } from "@/lib/utils/url";

// safeInternalPath ist die Open-Redirect-Sperre für jeden Rücksprungpfad,
// der aus einem Query-Parameter oder Formularfeld stammt: der
// E-Mail-Bestätigungslink (app/auth/callback/route.ts), das Fahrzeug-
// Formular (lib/actions/vehicles.ts) und die Anmeldung (signIn in
// lib/actions/auth.ts). Alle drei Werte sind vollständig client-kontrolliert
// — fällt diese Prüfung, wird aus jedem davon eine Weiterleitung auf eine
// fremde Domain, im Fall der Anmeldung direkt nach einer echten
// Passworteingabe. Deshalb hier festgehalten statt nur im Aufrufer.
describe("safeInternalPath", () => {
  it("lässt gewöhnliche interne Pfade durch", () => {
    expect(safeInternalPath("/fahrten/neu")).toBe("/fahrten/neu");
    expect(safeInternalPath("/")).toBe("/");
    expect(safeInternalPath("/strecken/abc?x=1#top")).toBe("/strecken/abc?x=1#top");
  });

  it("gibt null zurück, wenn nichts übergeben wurde", () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
  });

  it("weist absolute URLs auf fremde Ziele ab", () => {
    expect(safeInternalPath("https://evil.example")).toBeNull();
    expect(safeInternalPath("http://evil.example/pfad")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
  });

  // Der eigentliche Fallstrick: beides beginnt mit "/" und sieht damit
  // intern aus, wird vom Browser aber als protokollrelative externe URL
  // aufgelöst — "//evil.example" landet auf evil.example, nicht auf einem
  // Pfad der eigenen Domain.
  it("weist protokollrelative URLs ab, obwohl sie mit / beginnen", () => {
    expect(safeInternalPath("//evil.example")).toBeNull();
    expect(safeInternalPath("//evil.example/pfad")).toBeNull();
    expect(safeInternalPath("/\\evil.example")).toBeNull();
  });

  // Ein einzelner Slash gefolgt von etwas anderem als Slash/Backslash bleibt
  // ein interner Pfad, auch wenn ein Hostname darin vorkommt.
  it("verwechselt interne Pfade nicht mit externen Zielen", () => {
    expect(safeInternalPath("/evil.example")).toBe("/evil.example");
    expect(safeInternalPath("/redirect?to=https://evil.example")).toBe(
      "/redirect?to=https://evil.example",
    );
  });

  // formData.get() liefert FormDataEntryValue, also auch File, wenn ein
  // Client das Feld als Datei sendet. Ohne die typeof-Prüfung würde
  // .startsWith() darauf werfen — in signIn() direkt nach erfolgreicher
  // Anmeldung, also an der denkbar unpassendsten Stelle.
  it("weist Nicht-String-Werte aus FormData ab, statt zu werfen", () => {
    const file = new File(["x"], "next.txt", { type: "text/plain" });
    expect(() => safeInternalPath(file)).not.toThrow();
    expect(safeInternalPath(file)).toBeNull();
  });

  it("weist Pfade ohne führenden Slash ab", () => {
    expect(safeInternalPath("fahrten/neu")).toBeNull();
    expect(safeInternalPath("../fahrten/neu")).toBeNull();
  });
  // Der Grund, warum Steuerzeichen komplett abgewiesen werden: Der
  // URL-Parser streicht Tab, CR und LF aus einer URL, BEVOR er sie zerlegt
  // (WHATWG URL Standard, "URL parsing" — gilt in Browsern wie in Node).
  // Eine Prüfung, die nur die ersten beiden Zeichen ansieht, sieht bei
  // "/<TAB>/evil.example" ein einzelnes "/" und lässt durch; aufgelöst wird
  // daraus "//evil.example". Der Wert landet über BackButton (router.push)
  // und signIn (redirect) genau dort, wo er als relative URL verwendet wird.
  it("weist Tab, CR und LF ab, die der URL-Parser sonst entfernt", () => {
    expect(safeInternalPath("/\t/evil.example")).toBeNull();
    expect(safeInternalPath("/\n/evil.example")).toBeNull();
    expect(safeInternalPath("/\r/evil.example")).toBeNull();
    expect(safeInternalPath("/\t\\evil.example")).toBeNull();
  });

  // Gegenprobe zur obigen Regel: nach dem Entfernen der Steuerzeichen
  // ergäbe sich tatsächlich eine fremde Origin. Schlägt dieser Test fehl,
  // ist die Annahme über den Parser falsch — nicht der Guard.
  it("belegt, dass die abgewiesenen Formen sonst die Origin verlassen würden", () => {
    const basis = "https://cornice.example";
    expect(new URL("/\t/evil.example", basis).origin).toBe("https://evil.example");
    expect(new URL("/\n/evil.example", basis).origin).toBe("https://evil.example");
    expect(new URL("/\r/evil.example", basis).origin).toBe("https://evil.example");
  });

  // Prozentkodiert kommt der Wert aus einem Query-Parameter an; Next.js
  // dekodiert searchParams, bevor die Seite ihn sieht. Der Guard bekommt
  // also das echte Steuerzeichen und nicht die %09-Schreibweise — die
  // rohe Form bleibt ein harmloser interner Pfad.
  it("behandelt die dekodierte Form als Steuerzeichen, die rohe als Pfad", () => {
    expect(safeInternalPath(decodeURIComponent("/%09/evil.example"))).toBeNull();
    expect(safeInternalPath("/%09/evil.example")).toBe("/%09/evil.example");
  });

  // Weitere Steuerzeichen, die der Parser zwar nicht streicht, in einem
  // Rücksprungpfad aber nichts zu suchen haben: NUL und DEL. Beide würden
  // sonst bis in redirect() durchlaufen, wo Node einen Header mit
  // Steuerzeichen ablehnt — aus einem Angriffsversuch würde ein 500er.
  it("weist NUL und DEL ab", () => {
    expect(safeInternalPath("/profil\u0000")).toBeNull();
    expect(safeInternalPath("/profil\u007F")).toBeNull();
  });
});
