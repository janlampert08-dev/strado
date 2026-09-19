// Abruf der ASTRA-Verkehrsmeldungen (opentransportdata.swiss).
//
// Server-seitig, nur aus app/api/cron/passstatus gerufen. Die Deutung des
// Inhalts steht in lib/passMeldungen.ts — hier geht es allein darum, das XML
// zu beschaffen.
//
// Zugang: ein kostenloser Schlüssel der Plattform, als ASTRA_API_KEY in der
// Umgebung. Fehlt er, läuft die App ohne Feed weiter: jeder Passstatus bleibt
// dann "kein Stand", solange ihn niemand von Hand setzt. Das ist Absicht —
// ein fehlender Schlüssel darf keine Seite kaputt machen.

export const FEED_QUELLE = "astra_verkehrsmeldungen";

const ENDPUNKT = "https://api.opentransportdata.swiss/TDP/Soap_Datex2/TrafficSituations/Pull";
const SOAP_ACTION = "http://opentransportdata.swiss/TDP/Soap_Datex2/Pull/v1/pullTrafficMessages";
const ZEITLIMIT_MS = 20_000;

/**
 * Ab welchem Alter des letzten Erfolgs ein Delta nichts mehr taugt und wieder
 * voll abgeholt werden muss.
 *
 * **Nicht identisch mit dem Cron-Takt, und das ist der Punkt.** Stand hier die
 * Taktlänge selbst (fünf Minuten), dann war der Abstand zweier Läufe —
 * Taktlänge plus Verzögerung des Schedulers — praktisch immer grösser als die
 * Schwelle: jeder einzelne Lauf hätte voll abgeholt, rund 288-mal am Tag, bei
 * einem Feed, der einen Vollabruf pro Tag vorsieht. Der Dreifache des Takts
 * lässt Verspätungen und einen ausgefallenen Lauf durch und greift erst, wenn
 * wirklich eine Lücke entstanden ist.
 */
export const DELTA_MAX_ALTER_MS = 15 * 60 * 1000;
export const VOLL_ABSTAND_MS = 20 * 60 * 60 * 1000;

/** Der Rumpf nach der Vorlage der Plattform (VM_request_body.xml). Die
 *  Abo-Angaben sind Pflichtfelder des DATEX-Schemas, für einen Pull-Abruf
 *  aber ohne Wirkung: es gibt kein Abo und kein Ziel, an das geliefert wird. */
function anfrageKoerper(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <d2LogicalModel xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" modelBaseVersion="2" xmlns="http://datex2.eu/schema/2/2_0">
      <exchange>
        <supplierIdentification>
          <country>ch</country>
          <nationalIdentifier>FEDRO</nationalIdentifier>
        </supplierIdentification>
        <subscription>
          <operatingMode>operatingMode1</operatingMode>
          <subscriptionStartTime>${new Date().toISOString()}</subscriptionStartTime>
          <subscriptionState>active</subscriptionState>
          <updateMethod>singleElementUpdate</updateMethod>
          <target>
            <address></address>
            <protocol>http</protocol>
          </target>
        </subscription>
      </exchange>
    </d2LogicalModel>
  </soap:Body>
</soap:Envelope>`;
}

export function istFeedKonfiguriert(): boolean {
  return Boolean(process.env.ASTRA_API_KEY);
}

export type FeedErgebnis =
  | { ok: true; xml: string; voll: boolean }
  | { ok: false; fehler: string };

/**
 * Holt die Verkehrsmeldungen. `seit` schaltet auf Delta: der Feed liefert dann
 * nur Situationen, die sich seither geändert haben.
 */
// Das Wurzelelement einer DATEX-Lieferung. Namensraum offen, weil er
// zwischen Lieferungen wechselt — dieselbe Begründung wie in
// lib/passMeldungen.ts.
const DATEX_HUELLE = /<(?:[\w.-]+:)?(?:d2LogicalModel|payloadPublication)\b/i;

// Als eigene Funktion, damit die Regel geprüft werden kann, ohne einen
// Netzaufruf nachzustellen: ein leerer Rumpf ist in Ordnung (ein Delta ohne
// Änderung), ein gefüllter muss die DATEX-Hülle tragen.
export function rumpfIstBrauchbar(xml: string): boolean {
  if (xml.trim().length === 0) return true;
  return DATEX_HUELLE.test(xml);
}

export async function holeVerkehrsmeldungen(seit: Date | null): Promise<FeedErgebnis> {
  const schluessel = process.env.ASTRA_API_KEY;
  if (!schluessel) return { ok: false, fehler: "ASTRA_API_KEY fehlt" };

  const kopf: Record<string, string> = {
    Authorization: `Bearer ${schluessel}`,
    "Content-Type": "text/xml; charset=utf-8",
    SOAPAction: SOAP_ACTION,
  };
  if (seit) kopf["If-Modified-Since"] = seit.toUTCString();

  try {
    const antwort = await fetch(ENDPUNKT, {
      method: "POST",
      headers: kopf,
      body: anfrageKoerper(),
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      cache: "no-store",
    });

    // 304: seit dem letzten Abruf hat sich nichts geändert — beim DELTA ein
    // Erfolg ohne Inhalt. Auf einen Vollabruf ist dieselbe Antwort keine
    // Auskunft, sondern eine unbrauchbare: ein Vollabruf fragt ohne
    // If-Modified-Since, "nicht geändert" kann darauf keine Antwort sein.
    // Als Erfolg durchgelassen hiesse sie "es gibt keine Meldung mehr".
    if (antwort.status === 304) {
      if (!seit) return { ok: false, fehler: "304 auf Vollabruf" };
      return { ok: true, xml: "", voll: false };
    }

    if (!antwort.ok) {
      return { ok: false, fehler: `HTTP ${antwort.status}` };
    }

    const xml = await antwort.text();

    // Ein leerer Rumpf auf einen Vollabruf ist aus demselben Grund ein Fehler
    // und kein "in der Schweiz ist nichts los": eine abgebrochene Übertragung
    // sieht genau so aus, und der Abgleich würde daraus schliessen, dass jede
    // gespeicherte Sperrung aufgehoben ist.
    if (!seit && xml.trim().length === 0) {
      return { ok: false, fehler: "Leerer Rumpf auf Vollabruf" };
    }

    // Ein nicht leerer Rumpf muss wie DATEX aussehen — und zwar beim DELTA
    // genauso wie beim Vollabruf.
    //
    // Die drei Schutzregeln darüber hängen alle an `!seit`, greifen also nur
    // beim Vollabruf. Für ein Delta blieb eine Lücke: ein Dienst, der im
    // Störfall mit HTTP 200 und einem SOAP-Fault, einer HTML-Fehlerseite des
    // API-Managers oder einem umgestellten Namensraum antwortet, ergibt in
    // parseVerkehrsmeldungen() null Situationen — und das ist von dem
    // vollkommen legitimen "seit dem letzten Abruf hat sich nichts geändert"
    // nicht zu unterscheiden. Der Cron stempelt darauf `erfolg_am`, und weil
    // genau daran istFeedGesund() hängt (lib/passStatus.ts), zeigt jede
    // Passseite weiter "Offen · ASTRA-Verkehrsmeldungen · vor 4 Minuten".
    // Ein frisches `erfolg_am` verhindert zusätzlich, dass DELTA_MAX_ALTER_MS
    // einen Vollabruf erzwingt — die tote Quelle könnte bis zum nächsten
    // VOLL_ABSTAND_MS (20 Stunden) als aktueller Stand durchgehen. Das ist
    // die Richtung, vor der AGENTS.md ausdrücklich warnt: "kein Stand" ist
    // die ehrliche Auskunft, nicht "offen".
    //
    // Geprüft wird nur die Hülle, nicht der Inhalt: ein Delta ohne jede
    // Situation ist weiterhin ein gültiges Delta. Der Namensraum bleibt
    // offen, weil er zwischen Lieferungen wechselt (lib/passMeldungen.ts).
    if (!rumpfIstBrauchbar(xml)) {
      return { ok: false, fehler: "Rumpf ohne DATEX-Hülle" };
    }

    return { ok: true, xml, voll: !seit };
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : "unbekannt";
    return { ok: false, fehler: grund.slice(0, 200) };
  }
}
