import { describe, expect, it } from "vitest";
import { anzeigeFuerStatus, istFeedGesund, schwerwiegendster, seitWann, zeigeInListe } from "@/lib/passStatus";

const JETZT = new Date("2026-09-18T12:00:00Z");
const FRISCH = "2026-09-18T11:57:00Z";
const ALT = "2026-09-18T10:00:00Z";

describe("istFeedGesund", () => {
  it("traut einem frischen Abgleich und einem alten nicht", () => {
    expect(istFeedGesund(FRISCH, JETZT)).toBe(true);
    expect(istFeedGesund(ALT, JETZT)).toBe(false);
    expect(istFeedGesund(null, JETZT)).toBe(false);
  });
});

describe("anzeigeFuerStatus", () => {
  it("zeigt einen frischen Feed-Status, wie er ist", () => {
    const anzeige = anzeigeFuerStatus(
      { zustand: "wintersperre", meldung: "Sustenpass: Wintersperre", quelle: "feed", aktualisiertAm: FRISCH },
      FRISCH,
      JETZT,
    );
    expect(anzeige.zustand).toBe("wintersperre");
    expect(anzeige.text).toBe("Sustenpass: Wintersperre");
    expect(anzeige.herkunft).toContain("ASTRA");
  });

  it("nimmt einen Feed-Status zurück, sobald der Abgleich hängt", () => {
    const anzeige = anzeigeFuerStatus(
      { zustand: "offen", meldung: null, quelle: "feed", aktualisiertAm: ALT },
      ALT,
      JETZT,
    );
    expect(anzeige.zustand).toBe("unbekannt");
  });

  it("lässt eine laufende Setzung von Hand stehen, auch ohne Feed", () => {
    const anzeige = anzeigeFuerStatus(
      {
        zustand: "gesperrt",
        meldung: "Felssturz",
        quelle: "moderation",
        aktualisiertAm: ALT,
        manuellBis: "2026-09-25T12:00:00Z",
      },
      null,
      JETZT,
    );
    expect(anzeige.zustand).toBe("gesperrt");
    expect(anzeige.text).toBe("Felssturz");
  });

  it("nimmt eine abgelaufene Setzung von Hand zurück", () => {
    // Der Fall, der vorher ewig stehen blieb: Frist vorbei, und ohne
    // ASTRA-Schlüssel schreibt nie ein Feed-Lauf darüber.
    const anzeige = anzeigeFuerStatus(
      {
        zustand: "gesperrt",
        meldung: "Felssturz",
        quelle: "moderation",
        aktualisiertAm: "2026-03-01T12:00:00Z",
        manuellBis: "2026-03-08T12:00:00Z",
      },
      null,
      JETZT,
    );
    expect(anzeige.zustand).toBe("unbekannt");
    expect(anzeige.text).toContain("abgelaufen");
  });

  it("nimmt eine freigegebene Setzung von Hand zurück", () => {
    // pass_status_freigeben (0104) setzt nur manuell_bis auf null und lässt
    // Quelle und Zustand stehen. Ohne den null-Zweig war ausgerechnet die
    // ausdrückliche Freigabe schlechter als das Ablaufenlassen: das
    // freigegebene "gesperrt" stand unbefristet als aktuelle Auskunft da.
    const anzeige = anzeigeFuerStatus(
      {
        zustand: "gesperrt",
        meldung: "Felssturz",
        quelle: "moderation",
        aktualisiertAm: "2026-03-01T12:00:00Z",
        manuellBis: null,
      },
      null,
      JETZT,
    );
    expect(anzeige.zustand).toBe("unbekannt");
    expect(anzeige.text).toContain("freigegeben");
  });

  it("hält eine freigegebene Setzung, solange der Feed frisch ist", () => {
    // Dann ist der Feed zuständig und schreibt den Zustand ohnehin gleich um;
    // bis dahin ist der zuletzt bekannte Stand die bessere Auskunft.
    const anzeige = anzeigeFuerStatus(
      {
        zustand: "gesperrt",
        meldung: "Felssturz",
        quelle: "moderation",
        aktualisiertAm: "2026-03-01T12:00:00Z",
        manuellBis: null,
      },
      FRISCH,
      JETZT,
    );
    expect(anzeige.zustand).toBe("gesperrt");
  });

  it("hält eine abgelaufene Setzung, solange der Feed frisch ist — dann schreibt er sie ohnehin gleich um", () => {
    const anzeige = anzeigeFuerStatus(
      {
        zustand: "gesperrt",
        meldung: "Felssturz",
        quelle: "moderation",
        aktualisiertAm: "2026-03-01T12:00:00Z",
        manuellBis: "2026-03-08T12:00:00Z",
      },
      FRISCH,
      JETZT,
    );
    expect(anzeige.zustand).toBe("gesperrt");
  });

  it("sagt ohne Statuszeile, dass es noch keinen Abgleich gab", () => {
    const anzeige = anzeigeFuerStatus(null, FRISCH, JETZT);
    expect(anzeige.zustand).toBe("unbekannt");
    expect(anzeige.herkunft).toBe("Noch kein Abgleich");
  });
});

describe("seitWann", () => {
  it("formuliert Minuten, Stunden und ältere Tage verschieden", () => {
    expect(seitWann("2026-09-18T11:59:30Z", JETZT)).toBe("gerade eben");
    expect(seitWann("2026-09-18T11:58:00Z", JETZT)).toBe("vor 2 Minuten");
    expect(seitWann("2026-09-18T11:40:00Z", JETZT)).toBe("vor 20 Minuten");
    expect(seitWann("2026-09-18T09:00:00Z", JETZT)).toBe("vor 3 Stunden");
    expect(seitWann("2026-09-01T09:00:00Z", JETZT)).toBe("am 01.09.2026");
  });

  it("verkraftet Unsinn und nichts", () => {
    expect(seitWann(null, JETZT)).toBeNull();
    expect(seitWann("kein Datum", JETZT)).toBeNull();
  });
});

describe("schwerwiegendster", () => {
  it("nimmt den schlimmsten Zustand mehrerer Pässe", () => {
    expect(schwerwiegendster(["offen", "wintersperre"])).toBe("wintersperre");
    expect(schwerwiegendster(["offen", "unbekannt"])).toBe("unbekannt");
    expect(schwerwiegendster([])).toBeNull();
  });
});

describe("zeigeInListe", () => {
  it("zeigt in Listen nur, was die Planung ändert", () => {
    expect(zeigeInListe("gesperrt")).toBe(true);
    expect(zeigeInListe("offen")).toBe(false);
    expect(zeigeInListe("unbekannt")).toBe(false);
    expect(zeigeInListe(null)).toBe(false);
  });
});
