import { describe, expect, it } from "vitest";
import { OEFFENTLICHE_API_HEADER } from "./apiCors";

describe("OEFFENTLICHE_API_HEADER", () => {
  it("gibt die öffentliche Strecken-API für jede Origin frei", () => {
    expect(OEFFENTLICHE_API_HEADER["Access-Control-Allow-Origin"]).toBe("*");
  });

  // Der eigentliche Sicherheitsgehalt der Datei: mit Credentials würde der
  // Browser Cookies an einen Endpunkt schicken, den jede fremde Seite
  // ansteuern kann — die Antwort hinge dann an der Sitzung des Besuchers
  // statt an der anonymen Sicht. "*" und Credentials schliessen sich zwar
  // ohnehin aus, aber eine spätere Umstellung auf eine Origin-Liste würde
  // genau diese Sperre lautlos aufheben.
  it("setzt keine Credentials", () => {
    const schluessel = Object.keys(OEFFENTLICHE_API_HEADER).map((k) => k.toLowerCase());
    expect(schluessel).not.toContain("access-control-allow-credentials");
  });
});
