import { describe, expect, it } from "vitest";
import {
  PASSWORT_AENDERN_PFAD,
  WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN,
  codeAustauschIstWiederherstellung,
  signiereWiederherstellung,
  wiederherstellungGiltFuer,
} from "@/lib/passwortWiederherstellung";

// Diese Funktion entscheidet, ob updatePassword() das aktuelle Passwort
// abfragt. Sagt sie fälschlich "ja, das ist eine Wiederherstellung", reicht
// eine unbeaufsichtigt offene Sitzung, um ein Konto zu übernehmen — deshalb
// stehen hier vor allem die Fälle, in denen sie NICHT gelten darf. Das
// Geheimnis ist in den Tests fest verdrahtet, damit sie nicht vom
// Server-Geheimnis der Umgebung abhängen.
const GEHEIMNIS = "test-geheimnis";
const FALSCHES_GEHEIMNIS = "falsches-geheimnis";

describe("wiederherstellungGiltFuer", () => {
  const userId = "11111111-2222-3333-4444-555555555555";
  const andererUser = "99999999-8888-7777-6666-555555555555";
  const gueltig = signiereWiederherstellung(userId, GEHEIMNIS);

  it("gilt für den signierten Wert, für den das Merkmal gesetzt wurde", () => {
    expect(wiederherstellungGiltFuer(gueltig, userId, GEHEIMNIS)).toBe(true);
  });

  it("gilt NICHT für die blosse Nutzer-ID ohne Signatur", () => {
    // Die ID steht in jeder /fahrer/[id]-URL — von Hand eingetragen darf
    // sie die Passwort-Abfrage nicht abschalten.
    expect(wiederherstellungGiltFuer(userId, userId, GEHEIMNIS)).toBe(false);
  });

  it("gilt NICHT für ein anderes Konto auf demselben Gerät", () => {
    // Der eigentliche Grund, warum die ID im Cookie steht und nicht bloss
    // ein Ja/Nein: nach der Wiederherstellung meldet sich jemand anderes an.
    expect(wiederherstellungGiltFuer(gueltig, andererUser, GEHEIMNIS)).toBe(false);
    expect(
      wiederherstellungGiltFuer(
        signiereWiederherstellung(andererUser, GEHEIMNIS),
        userId,
        GEHEIMNIS,
      ),
    ).toBe(false);
  });

  it("gilt nach Ablauf nicht mehr — geprüft vom Server, nicht vom Browser", () => {
    const jetzt = Date.UTC(2026, 8, 24, 12, 0, 0);
    const wert = signiereWiederherstellung(userId, GEHEIMNIS, jetzt);
    const kurzDavor = jetzt + (WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN - 1) * 1000;
    const danach = jetzt + WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN * 1000;
    expect(wiederherstellungGiltFuer(wert, userId, GEHEIMNIS, kurzDavor)).toBe(true);
    expect(wiederherstellungGiltFuer(wert, userId, GEHEIMNIS, danach)).toBe(false);
  });

  it("gilt nicht, wenn der Ablauf von Hand verlängert wurde", () => {
    const jetzt = Date.UTC(2026, 8, 24, 12, 0, 0);
    const [id, ablauf, sig] = signiereWiederherstellung(userId, GEHEIMNIS, jetzt).split(".");
    const verlaengert = `${id}.${Number(ablauf) + 86_400}.${sig}`;
    expect(wiederherstellungGiltFuer(verlaengert, userId, GEHEIMNIS, jetzt)).toBe(false);
  });

  it("gilt nicht für einen Wert im alten Format ohne Ablauf", () => {
    expect(wiederherstellungGiltFuer(`${userId}.${"a".repeat(64)}`, userId, GEHEIMNIS)).toBe(false);
  });

  it("gilt nicht mit verfälschter Signatur oder falschem Geheimnis", () => {
    const faelschung = `${userId}.9999999999.${"0".repeat(64)}`;
    expect(wiederherstellungGiltFuer(faelschung, userId, GEHEIMNIS)).toBe(false);
    expect(wiederherstellungGiltFuer(gueltig.slice(0, -1) + "x", userId, GEHEIMNIS)).toBe(false);
    expect(wiederherstellungGiltFuer(gueltig, userId, FALSCHES_GEHEIMNIS)).toBe(false);
  });

  it("gilt nicht ohne Cookie", () => {
    expect(wiederherstellungGiltFuer(undefined, userId, GEHEIMNIS)).toBe(false);
    expect(wiederherstellungGiltFuer(null, userId, GEHEIMNIS)).toBe(false);
    expect(wiederherstellungGiltFuer("", userId, GEHEIMNIS)).toBe(false);
  });

  it("gilt nicht ohne Nutzer-ID", () => {
    // Ein leerer Vergleichswert darf nicht dazu führen, dass ein leeres
    // Cookie plötzlich passt.
    expect(wiederherstellungGiltFuer("", "", GEHEIMNIS)).toBe(false);
    expect(wiederherstellungGiltFuer(gueltig, "", GEHEIMNIS)).toBe(false);
  });
});

function token(amr: unknown): string {
  const teil = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${teil({ alg: "HS256" })}.${teil({ sub: "x", amr })}.signatur`;
}

describe("codeAustauschIstWiederherstellung", () => {
  const jetzt = Date.UTC(2026, 8, 24, 12, 0, 0);
  const vorZehnMinuten = new Date(jetzt - 10 * 60_000).toISOString();

  it("gilt nach einer frisch verschickten Zurücksetzen-E-Mail", () => {
    expect(
      codeAustauschIstWiederherstellung({
        accessToken: token([{ method: "otp", timestamp: 1 }]),
        recoverySentAt: vorZehnMinuten,
        jetztMs: jetzt,
      }),
    ).toBe(true);
  });

  it("gilt NICHT für eine Google-Anmeldung, auch nach ausgelöster Zurücksetzen-E-Mail", () => {
    // Der Angriff: am fremden, angemeldeten Gerät "Passwort vergessen"
    // auslösen, dann mit Google und next=/profil/passwort-aendern anmelden.
    expect(
      codeAustauschIstWiederherstellung({
        accessToken: token([{ method: "oauth", timestamp: 1 }]),
        recoverySentAt: vorZehnMinuten,
        jetztMs: jetzt,
      }),
    ).toBe(false);
    expect(
      codeAustauschIstWiederherstellung({
        accessToken: token(["oauth"]),
        recoverySentAt: vorZehnMinuten,
        jetztMs: jetzt,
      }),
    ).toBe(false);
  });

  it("gilt NICHT ohne verschickte Zurücksetzen-E-Mail (z.B. Registrierungsbestätigung)", () => {
    expect(
      codeAustauschIstWiederherstellung({
        accessToken: token([{ method: "otp", timestamp: 1 }]),
        recoverySentAt: null,
        jetztMs: jetzt,
      }),
    ).toBe(false);
  });

  it("gilt NICHT, wenn die Zurücksetzen-E-Mail älter als eine Stunde ist", () => {
    expect(
      codeAustauschIstWiederherstellung({
        accessToken: token([{ method: "otp", timestamp: 1 }]),
        recoverySentAt: new Date(jetzt - 61 * 60_000).toISOString(),
        jetztMs: jetzt,
      }),
    ).toBe(false);
  });
});

describe("Konstanten", () => {
  it("zeigt auf den Pfad, den requestPasswordReset als next-Ziel setzt", () => {
    // Der Callback setzt das Merkmal nur für genau diesen Pfad. Läuft er
    // auseinander, kommt niemand mehr durch den Zurücksetzen-Fluss.
    expect(PASSWORT_AENDERN_PFAD).toBe("/profil/passwort-aendern");
  });

  it("hält die Gültigkeit kurz", () => {
    expect(WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN).toBeLessThanOrEqual(30 * 60);
    expect(WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN).toBeGreaterThanOrEqual(5 * 60);
  });
});
