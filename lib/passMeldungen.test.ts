import { describe, expect, it } from "vitest";
import {
  deuteMeldung,
  entschluesselXml,
  istAktiv,
  istKernWintermonat,
  ordneMeldungZu,
  parseVerkehrsmeldungen,
  statusAusMeldungen,
  type DatexSituation,
  type PassMuster,
} from "@/lib/passMeldungen";

// Aufbau wie in der DATEX-II-Lieferung des ASTRA (Beispiel aus dem Cookbook
// von opentransportdata.swiss, gekürzt): Namensraum-Präfix dx223, Text in
// <value lang="de-CH">, Zustand zusätzlich als ...Type-Element.
function situationXml(optionen: {
  id: string;
  text: string;
  typ?: string;
  cancel?: boolean;
  von?: string;
  bis?: string;
}): string {
  return `
<dx223:situation id="${optionen.id}" version="3">
  <dx223:situationRecord xsi:type="dx223:RoadOrCarriagewayOrLaneManagement" id="rec.1" version="2">
    <dx223:situationRecordCreationTime>2026-01-04T22:00:50.789000Z</dx223:situationRecordCreationTime>
    <dx223:situationRecordVersionTime>2026-01-05T06:12:00.000000Z</dx223:situationRecordVersionTime>
    <dx223:validity>
      <dx223:validityTimeSpecification>
        ${optionen.von ? `<dx223:overallStartTime>${optionen.von}</dx223:overallStartTime>` : ""}
        ${optionen.bis ? `<dx223:overallEndTime>${optionen.bis}</dx223:overallEndTime>` : ""}
      </dx223:validityTimeSpecification>
    </dx223:validity>
    <dx223:generalPublicComment>
      <dx223:comment>
        <dx223:values>
          <dx223:value lang="de-CH">${optionen.text}</dx223:value>
        </dx223:values>
      </dx223:comment>
    </dx223:generalPublicComment>
    ${optionen.cancel ? "<dx223:management><dx223:lifeCycleManagement><dx223:cancel>true</dx223:cancel></dx223:lifeCycleManagement></dx223:management>" : ""}
    ${optionen.typ ? `<dx223:roadOrCarriagewayOrLaneManagementType>${optionen.typ}</dx223:roadOrCarriagewayOrLaneManagementType>` : ""}
  </dx223:situationRecord>
</dx223:situation>`;
}

// Dieselben Schreibweisen wie im Katalog (0107): Bindestrichform, Fremdsprachen,
// keine blossen Ortsnamen.
const PAESSE: PassMuster[] = [
  { id: "susten", suchbegriffe: ["Sustenpass", "Susten-Pass", "Col du Susten"] },
  { id: "furka", suchbegriffe: ["Furkapass", "Furka-Pass", "Col de la Furka"] },
  { id: "grimsel", suchbegriffe: ["Grimselpass", "Grimsel-Pass", "Col du Grimsel"] },
  { id: "gotthard", suchbegriffe: ["Gotthardpass", "Gotthard-Pass", "Tremola", "Passo del San Gottardo"] },
  { id: "bernina", suchbegriffe: ["Berninapass", "Bernina-Pass"] },
  { id: "ibergeregg", suchbegriffe: ["Ibergeregg", "Ibergeregg-Pass"] },
];

function situation(teil: Partial<DatexSituation> & { texte: string[] }): DatexSituation {
  return {
    id: "situation.1",
    typen: [],
    aufgehoben: false,
    gueltigVon: null,
    gueltigBis: null,
    versionAm: "2026-01-05T06:12:00.000Z",
    ...teil,
  };
}

describe("entschluesselXml", () => {
  it("löst benannte und numerische Entitäten auf", () => {
    expect(entschluesselXml("A2 Luzern &lt;-&gt; Basel &amp; Bern")).toBe("A2 Luzern <-> Basel & Bern");
    expect(entschluesselXml("Sch&#246;llenen")).toBe("Schöllenen");
    expect(entschluesselXml("Sch&#x00F6;llenen")).toBe("Schöllenen");
  });

  it("lässt unbekannte Entitäten stehen, statt sie zu verschlucken", () => {
    expect(entschluesselXml("100 &unbekannt; Meter")).toBe("100 &unbekannt; Meter");
  });
});

describe("parseVerkehrsmeldungen", () => {
  it("liest Id, Text, Typ und Gültigkeit aus einer Situation", () => {
    const [s] = parseVerkehrsmeldungen(
      situationXml({
        id: "situation.4711.1",
        text: "Sustenpass: Wintersperre",
        typ: "roadClosed",
        von: "2025-10-20T14:00:00Z",
        bis: "2026-06-01T08:00:00Z",
      }),
    );

    expect(s.id).toBe("situation.4711.1");
    expect(s.texte).toEqual(["Sustenpass: Wintersperre"]);
    expect(s.typen).toContain("roadClosed");
    expect(s.aufgehoben).toBe(false);
    expect(s.gueltigVon).toBe("2025-10-20T14:00:00.000Z");
    expect(s.gueltigBis).toBe("2026-06-01T08:00:00.000Z");
    // Die spätere Versionszeit gewinnt über die Erstellungszeit.
    expect(s.versionAm).toBe("2026-01-05T06:12:00.000Z");
  });

  it("erkennt aufgehobene Situationen", () => {
    const [s] = parseVerkehrsmeldungen(
      situationXml({ id: "s.1", text: "Sustenpass gesperrt", cancel: true }),
    );
    expect(s.aufgehoben).toBe(true);
  });

  it("liest mehrere Situationen aus einer Lieferung", () => {
    const xml =
      situationXml({ id: "s.1", text: "Sustenpass: Wintersperre" }) +
      situationXml({ id: "s.2", text: "Furkapass: Wintersperre" });
    expect(parseVerkehrsmeldungen(xml).map((s) => s.id)).toEqual(["s.1", "s.2"]);
  });

  it("kommt ohne Namensraum-Präfix zurecht", () => {
    const xml = `<situation id="s.9"><situationRecord><generalPublicComment><comment><values><value lang="de-CH">Grimselpass gesperrt</value></values></comment></generalPublicComment></situationRecord></situation>`;
    const [s] = parseVerkehrsmeldungen(xml);
    expect(s.id).toBe("s.9");
    expect(s.texte).toEqual(["Grimselpass gesperrt"]);
  });

  // Die echte Lieferung trägt <value>-Elemente auch ausserhalb der Meldung:
  // Aufzählungswerte wie "duringTheNight" standen bei 523 von 890 Situationen
  // an erster Stelle, bevor die Auswertung auf generalPublicComment begrenzt
  // wurde. Das ist nicht nur Rauschen — an texte[0] hing die Erkennung einer
  // aufgehobenen Meldung.
  it("liest nur den öffentlichen Meldungstext, nicht jedes <value> im Dokument", () => {
    const xml = `<dx223:situation id="s.10">
      <dx223:situationRecord>
        <dx223:validityTimeSpecification><dx223:recurringTimePeriodOfDay><dx223:value>duringTheNight</dx223:value></dx223:recurringTimePeriodOfDay></dx223:validityTimeSpecification>
        <dx223:generalPublicComment><dx223:comment><dx223:values>
          <dx223:value lang="de-CH">Klausenpass: Strecke gesperrt</dx223:value>
          <dx223:value lang="fr-CH">Col du Klausen: route fermée</dx223:value>
        </dx223:values></dx223:comment></dx223:generalPublicComment>
      </dx223:situationRecord>
    </dx223:situation>`;
    const [s] = parseVerkehrsmeldungen(xml);
    expect(s.texte).toEqual(["Klausenpass: Strecke gesperrt", "Col du Klausen: route fermée"]);
  });

  it("erkennt eine Aufhebung auch, wenn sie nicht im ersten Text steht", () => {
    const xml = `<situation id="s.11"><situationRecord><generalPublicComment><comment><values>
      <value lang="fr-CH">Levé: Col du Susten</value>
      <value lang="de-CH">Aufgehoben: Sustenpass gesperrt</value>
    </values></comment></generalPublicComment></situationRecord></situation>`;
    expect(parseVerkehrsmeldungen(xml)[0].aufgehoben).toBe(true);
  });

  it("erkennt eine ausgesetzte Situation über den Gültigkeitsstatus", () => {
    const xml = `<situation id="s.12"><situationRecord>
      <validityStatus>suspended</validityStatus>
      <generalPublicComment><comment><values><value lang="de-CH">Sustenpass gesperrt</value></values></comment></generalPublicComment>
    </situationRecord></situation>`;
    expect(parseVerkehrsmeldungen(xml)[0].aufgehoben).toBe(true);
  });

  it("liefert für Unsinn eine leere Liste statt einer Ausnahme", () => {
    expect(parseVerkehrsmeldungen("")).toEqual([]);
    expect(parseVerkehrsmeldungen("<html><body>Wartung</body></html>")).toEqual([]);
    // Situation ohne id ist unbrauchbar: ohne sie lässt sich kein Delta führen.
    expect(parseVerkehrsmeldungen("<situation version='1'><value>Susten</value></situation>")).toEqual([]);
  });
});

describe("deuteMeldung", () => {
  it("erkennt die Wintersperre in drei Sprachen", () => {
    expect(deuteMeldung(["Sustenpass: Wintersperre"], [])).toBe("wintersperre");
    expect(deuteMeldung(["Col du Susten: fermeture hivernale"], [])).toBe("wintersperre");
    expect(deuteMeldung(["Passo del Lucomagno: chiusura invernale"], [])).toBe("wintersperre");
  });

  it("erkennt eine Sperrung, auch nur über den codierten Typ", () => {
    expect(deuteMeldung(["Klausenpass: Strasse gesperrt"], [])).toBe("gesperrt");
    expect(deuteMeldung(["Klausenpass"], ["roadClosed"])).toBe("gesperrt");
  });

  it("wertet eine Sperrung für andere Fahrzeugarten nicht als Sperrung", () => {
    expect(deuteMeldung(["Sustenpass: für Lastwagen gesperrt"], [])).toBe("eingeschraenkt");
    expect(deuteMeldung(["Sustenpass: gesperrt für Gespanne und Anhänger"], [])).toBe("eingeschraenkt");
  });

  it("wertet eine zeitweise Sperrung als Einschränkung", () => {
    expect(deuteMeldung(["Gotthardpass: Nachtsperre 20–06 Uhr"], [])).toBe("eingeschraenkt");
    expect(deuteMeldung(["Oberalppass: einspurig, Lichtsignal"], [])).toBe("eingeschraenkt");
  });

  it("erkennt Ketten- und Winterausrüstungspflicht als Einschränkung", () => {
    expect(deuteMeldung(["Julierpass: Schneeketten obligatorisch"], [])).toBe("eingeschraenkt");
    expect(deuteMeldung(["Julier"], ["snowChainsMandatory"])).toBe("eingeschraenkt");
  });

  it("schweigt zu Meldungen ohne Aussage über die Befahrbarkeit", () => {
    expect(deuteMeldung(["A2: Stau zwischen Erstfeld und Göschenen, 5 km"], [])).toBeNull();
    expect(deuteMeldung(["Sustenpass: Bauarbeiten"], [])).toBeNull();
  });
});

describe("ordneMeldungZu", () => {
  it("ordnet über den Namen zu", () => {
    const treffer = ordneMeldungZu(situation({ texte: ["Sustenpass: Wintersperre"] }), PAESSE);
    expect(treffer.map((t) => t.passId)).toEqual(["susten"]);
    expect(treffer[0].zustand).toBe("wintersperre");
  });

  it("trifft alle in einer Meldung genannten Pässe", () => {
    const treffer = ordneMeldungZu(
      situation({ texte: ["Furkapass und Grimselpass: Wintersperre"] }),
      PAESSE,
    );
    expect(treffer.map((t) => t.passId).sort()).toEqual(["furka", "grimsel"]);
  });

  // Die Schreibweise, die der ASTRA-Feed tatsächlich verwendet — gemessen an
  // einer echten Lieferung: "zwischen Pass Gotthard-Pass und Ortschaft …".
  it("versteht die Schreibweise des Feeds mit Bindestrich und Gattungswort", () => {
    const treffer = ordneMeldungZu(
      situation({
        texte: ["H2 Airolo <-> Göschenen zwischen Pass Gotthard-Pass und Ortschaft Motto Bartola Sachlage: Strecke gesperrt"],
      }),
      PAESSE,
    );
    expect(treffer.map((t) => t.passId)).toEqual(["gotthard"]);
  });

  it("versteht die französische Fassung derselben Meldung", () => {
    const treffer = ordneMeldungZu(
      situation({ texte: ["Libéré: Col Col du Grimsel Situation: route fermée"] }),
      PAESSE,
    );
    expect(treffer.map((t) => t.passId)).toEqual(["grimsel"]);
  });

  // Die drei Fehltreffer aus dem ersten Probelauf gegen echte Daten. Ein
  // Passname ist in der Schweiz auch ein Dorf oder eine Strasse.
  it("verwechselt das Dorf Leuk/Susten nicht mit dem Sustenpass", () => {
    expect(
      ordneMeldungZu(
        situation({
          texte: ["A9 Sion <-> Brig zwischen Anschluss Leuk/Susten-Ost und Anschluss Gampel/Steg-West Sachlage: Strecke gesperrt"],
        }),
        PAESSE,
      ),
    ).toEqual([]);
  });

  it("hält eine Strasse namens Simplon nicht für den Simplonpass", () => {
    const simplon: PassMuster[] = [{ id: "simplon", suchbegriffe: ["Simplonpass", "Simplon-Pass", "Col du Simplon"] }];
    expect(
      ordneMeldungZu(
        situation({ texte: ["Route de la Lienne <-> Route Du Simplon Sachlage: Strecke gesperrt"] }),
        simplon,
      ),
    ).toEqual([]);
    expect(
      ordneMeldungZu(
        situation({ texte: ["A9 Brig <-> Domodossola zwischen Ortschaft Simplon-Dorf und Ortschaft Gabi Sachlage: Strecke gesperrt"] }),
        simplon,
      ),
    ).toEqual([]);
  });

  it("nimmt einen Namen ohne Gattungswort nur mit 'Pass' davor", () => {
    // Ibergeregg trägt kein "Pass" im Namen — der Feed schreibt "Pass Ibergeregg".
    expect(
      ordneMeldungZu(situation({ texte: ["Pass Ibergeregg Sachlage: Strecke gesperrt"] }), PAESSE)
        .map((t) => t.passId),
    ).toEqual(["ibergeregg"]);
    expect(
      ordneMeldungZu(situation({ texte: ["Ortschaft Ibergeregg Sachlage: Strecke gesperrt"] }), PAESSE),
    ).toEqual([]);
  });

  it("verwechselt einen Wortteil nicht mit dem Pass", () => {
    // "Berninabahn" ist kein Berninapass.
    expect(ordneMeldungZu(situation({ texte: ["Berninabahn: Ersatzbus"] }), PAESSE)).toEqual([]);
  });

  it("lässt Tunnel- und Autoverlad-Meldungen liegen", () => {
    expect(
      ordneMeldungZu(situation({ texte: ["Furka-Autoverlad: Betrieb eingestellt, Strasse gesperrt"] }), PAESSE),
    ).toEqual([]);
    expect(
      ordneMeldungZu(situation({ texte: ["Gotthard-Strassentunnel gesperrt"] }), PAESSE),
    ).toEqual([]);
  });

  it("nimmt eine Tunnelmeldung, die ausdrücklich die Passstrasse nennt", () => {
    const treffer = ordneMeldungZu(
      situation({ texte: ["Gotthardpass gesperrt, Umfahrung über den Tunnel"] }),
      PAESSE,
    );
    expect(treffer.map((t) => t.passId)).toEqual(["gotthard"]);
  });

  it("ignoriert aufgehobene Meldungen", () => {
    expect(ordneMeldungZu(situation({ texte: ["Sustenpass gesperrt"], aufgehoben: true }), PAESSE)).toEqual([]);
  });

  it("ignoriert Meldungen ohne Aussage und ohne bekannten Pass", () => {
    expect(ordneMeldungZu(situation({ texte: ["Sustenpass: Stau"] }), PAESSE)).toEqual([]);
    expect(ordneMeldungZu(situation({ texte: ["Albulapass: Wintersperre"] }), PAESSE)).toEqual([]);
  });
});

describe("istKernWintermonat", () => {
  it("nimmt die Randmonate der Spanne aus", () => {
    // Oktober bis Mai → Kern November bis April.
    expect(istKernWintermonat(10, 10, 5)).toBe(false);
    expect(istKernWintermonat(11, 10, 5)).toBe(true);
    expect(istKernWintermonat(1, 10, 5)).toBe(true);
    expect(istKernWintermonat(4, 10, 5)).toBe(true);
    expect(istKernWintermonat(5, 10, 5)).toBe(false);
    expect(istKernWintermonat(7, 10, 5)).toBe(false);
  });

  it("kennt keinen Kern ohne Wintersperre", () => {
    expect(istKernWintermonat(1, null, null)).toBe(false);
  });

  it("kennt keinen Kern bei sehr kurzer Spanne", () => {
    expect(istKernWintermonat(3, 2, 3)).toBe(false);
    expect(istKernWintermonat(8, 2, 3)).toBe(false);
  });
});

describe("istAktiv", () => {
  const jetzt = new Date("2026-01-15T12:00:00Z");

  it("zählt eine Meldung ohne Zeitangaben als aktiv", () => {
    expect(istAktiv({ zustand: "gesperrt", text: "x", gueltigVon: null, gueltigBis: null }, jetzt)).toBe(true);
  });

  it("zählt eine künftige Sperrung noch nicht", () => {
    expect(
      istAktiv({ zustand: "gesperrt", text: "x", gueltigVon: "2026-02-01T00:00:00Z", gueltigBis: null }, jetzt),
    ).toBe(false);
  });

  it("zählt eine abgelaufene Sperrung nicht mehr", () => {
    expect(
      istAktiv({ zustand: "gesperrt", text: "x", gueltigVon: null, gueltigBis: "2026-01-01T00:00:00Z" }, jetzt),
    ).toBe(false);
  });
});

describe("statusAusMeldungen", () => {
  const sommer = new Date("2026-07-15T09:00:00Z");
  const winter = new Date("2026-01-15T09:00:00Z");

  it("meldet ohne Meldung offen", () => {
    expect(
      statusAusMeldungen([], {
        jetzt: sommer,
        feedGesund: true,
        wintersperreAbMonat: 10,
        wintersperreBisMonat: 5,
      }),
    ).toEqual({ zustand: "offen", meldung: null });
  });

  it("nimmt die schwerwiegendste aktive Meldung", () => {
    const ergebnis = statusAusMeldungen(
      [
        { zustand: "eingeschraenkt", text: "Schneeketten", gueltigVon: null, gueltigBis: null },
        { zustand: "gesperrt", text: "Felssturz, gesperrt", gueltigVon: null, gueltigBis: null },
      ],
      { jetzt: sommer, feedGesund: true, wintersperreAbMonat: null, wintersperreBisMonat: null },
    );
    expect(ergebnis).toEqual({ zustand: "gesperrt", meldung: "Felssturz, gesperrt" });
  });

  it("sagt im Kernwinter lieber nichts als 'offen'", () => {
    expect(
      statusAusMeldungen([], {
        jetzt: winter,
        feedGesund: true,
        wintersperreAbMonat: 10,
        wintersperreBisMonat: 5,
      }).zustand,
    ).toBe("unbekannt");
  });

  it("meldet einen ganzjährigen Pass auch im Januar als offen", () => {
    expect(
      statusAusMeldungen([], {
        jetzt: winter,
        feedGesund: true,
        wintersperreAbMonat: null,
        wintersperreBisMonat: null,
      }).zustand,
    ).toBe("offen");
  });

  it("sagt bei krankem Feed nichts", () => {
    expect(
      statusAusMeldungen(
        [{ zustand: "gesperrt", text: "gesperrt", gueltigVon: null, gueltigBis: null }],
        { jetzt: sommer, feedGesund: false, wintersperreAbMonat: null, wintersperreBisMonat: null },
      ),
    ).toEqual({ zustand: "unbekannt", meldung: null });
  });
});
