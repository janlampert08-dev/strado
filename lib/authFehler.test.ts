import { describe, expect, it } from "vitest";
import {
  FEHLER_BESTAETIGUNG,
  FEHLER_LINK,
  authFehlerText,
  versandFehlerText,
} from "@/lib/authFehler";

describe("authFehlerText", () => {
  it("kennt die beiden Werte, die der Callback setzt", () => {
    expect(authFehlerText(FEHLER_BESTAETIGUNG)).toBeTruthy();
    expect(authFehlerText(FEHLER_LINK)).toBeTruthy();
  });

  it("nennt beim Zurücksetzen-Link den Browser als möglichen Grund", () => {
    // Der häufigste echte Fall: Link am Rechner angefordert, E-Mail auf dem
    // Handy geöffnet. Ohne diesen Hinweis sucht die Person den Fehler bei
    // sich und fordert denselben Link immer wieder neu an.
    expect(authFehlerText(FEHLER_LINK)).toContain("Browser");
  });

  it("gibt für einen unbekannten Wert nichts aus", () => {
    expect(authFehlerText("irgendwas")).toBeNull();
    expect(authFehlerText("")).toBeNull();
  });

  it("gibt keinen fremden Text aus", () => {
    // Der Wert steht in der Adresszeile und ist beliebig setzbar. Würde er
    // durchgereicht, liesse sich über einen Link eine fremde Aussage auf der
    // Anmeldeseite platzieren.
    const untergeschoben = "Ihr Konto wurde gesperrt. Rufen Sie 0900 …";
    expect(authFehlerText(untergeschoben)).toBeNull();
  });

  it("gilt nicht für einen doppelt gesetzten Parameter", () => {
    expect(authFehlerText([FEHLER_LINK, FEHLER_BESTAETIGUNG])).toBeNull();
    expect(authFehlerText(undefined)).toBeNull();
    expect(authFehlerText(null)).toBeNull();
  });
});

describe("versandFehlerText", () => {
  it("nennt bei einer Zeitüberschreitung das Postfach statt eines Fehlschlags", () => {
    // Der gemessene Fall: Client bekommt 504, der Versand läuft weiter und
    // war nach 83 s erfolgreich. "Konnte nicht verschickt werden" wäre hier
    // falsch und würde zu einer zweiten, ebenso langsamen Anfrage führen.
    for (const status of [408, 502, 503, 504]) {
      expect(versandFehlerText(status, undefined)).toContain("Postfach");
    }
  });

  it("nennt bei 429 die Bremse", () => {
    expect(versandFehlerText(429, undefined)).toContain("Zu viele");
    expect(versandFehlerText(undefined, "over_email_send_rate_limit")).toContain("Zu viele");
  });

  it("meldet alles andere als echten Fehlschlag", () => {
    expect(versandFehlerText(500, undefined)).toContain("nicht verschickt");
    expect(versandFehlerText(undefined, undefined)).toContain("nicht verschickt");
  });

  it("verrät in keiner Variante etwas über das Konto", () => {
    // Bei unbekannter Adresse antwortet Supabase fehlerfrei — eine Meldung
    // hier kommt immer vom Versandweg. Keine davon darf die Adresse nennen.
    for (const [status, code] of [[429, undefined], [504, undefined], [500, undefined]] as const) {
      expect(versandFehlerText(status, code).toLowerCase()).not.toContain("konto");
      expect(versandFehlerText(status, code)).not.toContain("@");
    }
  });
});
