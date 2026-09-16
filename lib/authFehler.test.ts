import { describe, expect, it } from "vitest";
import {
  FEHLER_BESTAETIGUNG,
  FEHLER_LINK,
  authFehlerText,
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

  it("gibt für geerbte Object-Schlüssel nichts aus", () => {
    // MELDUNGEN ist ein Objektliteral und erbt von Object.prototype. Ein
    // blosser Indexzugriff liefert für diese Schlüssel eine Funktion bzw. ein
    // Objekt statt undefined — "?? null" fängt das nicht ab, weil beides
    // nicht nullish ist. Der Wert landete als Prop bei einer
    // Client-Komponente und brach den RSC-Render ab: /anmelden?fehler=toString
    // kam ohne Anmeldeformular beim Nutzer an (gegen das Preview gemessen).
    //
    // Der Test darüber prüft "irgendwas" und "" — beides fehlende EIGENE
    // Schlüssel, die diese Lücke nicht treffen.
    for (const schluessel of [
      "toString",
      "valueOf",
      "constructor",
      "hasOwnProperty",
      "__proto__",
      "propertyIsEnumerable",
    ]) {
      expect(authFehlerText(schluessel)).toBeNull();
    }
  });

  it("gilt nicht für einen doppelt gesetzten Parameter", () => {
    expect(authFehlerText([FEHLER_LINK, FEHLER_BESTAETIGUNG])).toBeNull();
    expect(authFehlerText(undefined)).toBeNull();
    expect(authFehlerText(null)).toBeNull();
  });
});

