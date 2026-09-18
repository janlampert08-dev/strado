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
 * Der Feed verlangt einen Vollabruf höchstens täglich und dazwischen Deltas,
 * deren If-Modified-Since nicht älter als fünf Minuten ist. Der Cron läuft
 * deshalb alle fünf Minuten (vercel.json); ist der letzte Erfolg länger her,
 * ist ein Delta wertlos und es muss wieder voll abgeholt werden.
 */
export const DELTA_MAX_ALTER_MS = 5 * 60 * 1000;
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

    // 304: seit dem letzten Abruf hat sich nichts geändert — ein Erfolg ohne
    // Inhalt, kein Fehler.
    if (antwort.status === 304) return { ok: true, xml: "", voll: !seit };

    if (!antwort.ok) {
      return { ok: false, fehler: `HTTP ${antwort.status}` };
    }

    return { ok: true, xml: await antwort.text(), voll: !seit };
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : "unbekannt";
    return { ok: false, fehler: grund.slice(0, 200) };
  }
}
