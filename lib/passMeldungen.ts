// Aus Verkehrsmeldungen wird ein Passstatus.
//
// Quelle sind die Verkehrsmeldungen des ASTRA (opentransportdata.swiss,
// DATEX II 2.3): Meldungen der Verkehrsmanagementzentrale VMZ-CH, der
// Kantonspolizeien und der Strassenunterhaltsdienste. Abgeholt wird der Feed
// in lib/astraFeed.ts, geschrieben in app/api/cron/passstatus — hier steht
// nur, was aus dem XML gelesen und wie es gedeutet wird. Reine Funktionen,
// damit genau dieser Teil testbar ist (lib/passMeldungen.test.ts).
//
// ---------------------------------------------------------------------------
// Warum über den Meldungstext zugeordnet wird und nicht über die Geometrie
// ---------------------------------------------------------------------------
// DATEX II verortet eine Meldung über ALERT-C/TMC: eine Tabellennummer und
// einen Ortscode ("specificLocation 10432"). Die Auflösung dieser Codes
// verlangt die TMC-Ortstabelle, die beim ASTRA einzeln angefragt werden muss
// und nicht Teil des offenen Datensatzes ist. Ohne sie bleibt der
// mehrsprachige Meldungstext, und der nennt den Pass beim Namen
// ("Sustenpass: Wintersperre").
//
// Das ist die schwächste Stelle der ganzen Kette, und sie ist es bewusst:
// ein Treffer über einen Namen kann danebenliegen. Drei Dinge fangen das ab —
// eng gefasste Suchbegriffe je Pass (paesse.suchbegriffe, siehe 0104), die
// Tunnelregel unten, und die Übersteuerung durch Moderatoren, die jeden
// falschen Status von Hand korrigieren.

/** Ein Zustand, wie ihn pass_status.zustand kennt (0104). */
export type PassZustand = "offen" | "eingeschraenkt" | "gesperrt" | "wintersperre" | "unbekannt";

/** Die Zustände, die eine Meldung auslösen kann — "offen" entsteht aus dem
 *  Fehlen einer Meldung, "unbekannt" aus dem Fehlen des Feeds. */
export type MeldungsZustand = "eingeschraenkt" | "gesperrt" | "wintersperre";

export interface DatexSituation {
  id: string;
  /** Die öffentlichen Meldungstexte der Situation, in allen gelieferten
   *  Sprachen (de/fr/it). */
  texte: string[];
  /** Werte aller ...Type-Elemente, z.B. "roadClosed", "snowChainsMandatory". */
  typen: string[];
  /** true, wenn die Situation aufgehoben/beendet ist (lifeCycleManagement). */
  aufgehoben: boolean;
  gueltigVon: string | null;
  gueltigBis: string | null;
  versionAm: string | null;
}

export interface PassMuster {
  id: string;
  suchbegriffe: string[];
}

export interface PassTreffer {
  situationId: string;
  passId: string;
  zustand: MeldungsZustand;
  text: string;
  gueltigVon: string | null;
  gueltigBis: string | null;
  versionAm: string | null;
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const XML_ENTITAETEN: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

// Kein XML-Parser als Abhängigkeit (AGENTS.md, Regel 15): gebraucht werden
// fünf Felder aus einem Dokument mit bekanntem Aufbau, und der Präfix des
// DATEX-Namensraums wechselt zwischen Lieferungen ("dx223:situation" vs.
// "situation"). Die Ausdrücke unten lassen ihn deshalb überall offen.
export function entschluesselXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (treffer, code: string) => {
    const kleingeschrieben = code.toLowerCase();
    try {
      if (kleingeschrieben.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (kleingeschrieben.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
    } catch {
      return treffer;
    }
    return XML_ENTITAETEN[kleingeschrieben] ?? treffer;
  });
}

/** Alle Blöcke eines Elements samt Inhalt — für verschachtelte Strukturen,
 *  aus denen nur ein Teil gelesen werden soll. */
function elementBloecke(block: string, name: string): string[] {
  const ausdruck = new RegExp(
    `<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`,
    "gi",
  );
  return [...block.matchAll(ausdruck)].map((t) => t[1]);
}

function elementInhalte(block: string, name: string): string[] {
  const ausdruck = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "gi");
  return [...block.matchAll(ausdruck)].map((t) => entschluesselXml(t[1]).trim());
}

function ersterInhalt(block: string, name: string): string | null {
  return elementInhalte(block, name)[0] ?? null;
}

/** Zeitstempel nur übernehmen, wenn er sich parsen lässt — ein kaputter Wert
 *  soll keine Meldung mit "gültig bis 1970" in die Datenbank schreiben. */
function alsZeitstempel(wert: string | null): string | null {
  if (!wert) return null;
  const zeit = new Date(wert);
  return Number.isNaN(zeit.getTime()) ? null : zeit.toISOString();
}

export function parseVerkehrsmeldungen(xml: string): DatexSituation[] {
  const situationen: DatexSituation[] = [];
  const ausdruck = /<(?:[\w.-]+:)?situation\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?situation>/gi;

  for (const treffer of xml.matchAll(ausdruck)) {
    const kopf = treffer[1];
    const block = treffer[2];
    const id = /\bid="([^"]*)"/.exec(kopf)?.[1];
    if (!id) continue;

    // NUR die Texte aus generalPublicComment. Vorher wurde jedes <value> im
    // Dokument eingesammelt — und die echte Lieferung des ASTRA hat viele
    // davon ausserhalb der Meldung: Aufzählungswerte wie "duringTheNight"
    // standen bei 520 von 890 Situationen an erster Stelle. Das ist nicht nur
    // Rauschen, es verschob den Text, an dem die Aufhebung erkannt wird.
    const texte = [
      ...new Set(
        elementBloecke(block, "generalPublicComment")
          .flatMap((kommentar) => elementInhalte(kommentar, "value"))
          .filter((t) => t.length > 0),
      ),
    ];

    // Jedes Element, dessen Name auf "Type" endet: roadOrCarriagewayOrLaneManagementType,
    // winterEquipmentManagementType, abnormalTrafficType, … Sie sind die
    // codierte Aussage der Meldung und sprachunabhängig.
    const typen = [
      ...new Set(
        [...block.matchAll(/<(?:[\w.-]+:)?\w*Type\b[^>]*>([^<]*)</gi)]
          .map((t) => t[1].trim())
          .filter((t) => t.length > 0 && t.length < 80),
      ),
    ];

    // Drei Wege, auf denen eine Situation erledigt sein kann, und die echte
    // Lieferung des ASTRA nutzt alle drei:
    //   * <cancel>/<end> im lifeCycleManagement,
    //   * validityStatus "suspended" statt "active",
    //   * der Vorspann "Aufgehoben:" / "Levé:" / "Revocato:" im Meldungstext.
    //
    // Der letzte wird über ALLE Sprachfassungen geprüft, nicht nur über die
    // erste: welche zuerst steht, entscheidet die Reihenfolge im XML, und in
    // der echten Lieferung ist das mal die deutsche, mal eine andere.
    const aufgehoben =
      /<(?:[\w.-]+:)?(?:cancel|end)\b[^>]*>\s*true\s*</i.test(block) ||
      /<(?:[\w.-]+:)?validityStatus\b[^>]*>\s*suspended\s*</i.test(block) ||
      texte.some((t) => AUFGEHOBEN.test(t));

    situationen.push({
      id,
      texte,
      typen,
      aufgehoben,
      gueltigVon: alsZeitstempel(ersterInhalt(block, "overallStartTime")),
      gueltigBis: alsZeitstempel(ersterInhalt(block, "overallEndTime")),
      versionAm:
        alsZeitstempel(elementInhalte(block, "situationRecordVersionTime").sort().at(-1) ?? null) ??
        alsZeitstempel(ersterInhalt(block, "situationRecordCreationTime")),
    });
  }

  return situationen;
}

// ---------------------------------------------------------------------------
// Deutung
// ---------------------------------------------------------------------------

// Aufgehoben-Vorspann, wie ihn die VMZ setzt ("Aufgehoben: A2 Luzern <-> …").
const AUFGEHOBEN = /^\s*(aufgehoben|behoben|levée|levee|annullato|revocat[ao]|annulé|annule)\b/i;

const WINTERSPERRE =
  /wintersperr|winterschliessung|fermeture hivernale|ferm[ée]e? pour l'hiver|chiusura invernale|chiuso per l'inverno|chiusura stagionale/i;

const GESPERRT =
  /\bgesperrt\b|\bsperrung\b|\bstrassensperrung\b|\bgeschlossen\b|(?<!\p{L})ferm[ée]e?(?!\p{L})|\bfermeture\b|\bchius[ao]\b|\bchiusura\b|road closed/iu;

const NUR_TEILWEISE =
  /nachtsperr|nachts gesperrt|zeitweise|einspurig|kolonnenverkehr|wechselseitig|lichtsignal|circulation altern|senso unico|schneeketten|winterausr[üu]stung|ketten|cha[îi]nes|catene|pneus? neige|einschr[äa]nk/i;

// Eine Sperrung, die nur eine Fahrzeugart trifft, ist für Auto und Töff keine
// Sperrung. Ohne diese Ausnahme stünde der Pass auf "gesperrt", weil Lastwagen
// nicht dürfen.
const NUR_FUER_ANDERE =
  /f[üu]r (lastwagen|lkw|lastw|schwerverkehr|wohnwagen|anh[äa]nger|cars?|reisecars?|fahrzeuge [üu]ber|gespanne)|poids lourds|camion|rimorchi/i;

const TUNNEL = /tunnel|autoverlad|verladestation|ferroutage|traforo|galleria/i;

// Ein Suchbegriff, der das Wort Pass/Col/Passo/Strasse selbst trägt, meint die
// Passstrasse — auch wenn im Text ein Tunnel vorkommt.
const BEGRIFF_MEINT_PASS = /pass|col\b|passo|strasse|strada|route|tremola/i;

const TYP_GESPERRT = /roadClosed|carriagewayClosed|closed|blocked/i;
const TYP_WINTER = /winterEquipment|snowChains|winterDriving/i;
const TYP_TEILWEISE = /laneClosures|carriagewayClosures|narrowLanes|contraflow|convoy|alternat/i;

/**
 * Was eine Meldung für eine Passstrasse bedeutet — oder null, wenn sie nichts
 * über ihre Befahrbarkeit sagt (Stau, Unfall ohne Sperrung, Baustelle ohne
 * Einschränkung). Reihenfolge ist Absicht: erst das Speziellere.
 */
export function deuteMeldung(texte: string[], typen: string[]): MeldungsZustand | null {
  const text = texte.join(" · ");
  const typenText = typen.join(" ");

  if (WINTERSPERRE.test(text)) return "wintersperre";

  const gesperrt = GESPERRT.test(text) || TYP_GESPERRT.test(typenText);

  if (gesperrt && NUR_FUER_ANDERE.test(text)) return "eingeschraenkt";
  if (gesperrt && NUR_TEILWEISE.test(text)) return "eingeschraenkt";
  if (gesperrt) return "gesperrt";

  if (NUR_TEILWEISE.test(text) || TYP_WINTER.test(typenText) || TYP_TEILWEISE.test(typenText)) {
    return "eingeschraenkt";
  }

  return null;
}

/**
 * Trifft der Suchbegriff im Text — und meint er dort tatsächlich den Pass?
 *
 * DIE ZWEITE HÄLFTE IST DER GANZE PUNKT, und sie stammt aus der echten
 * Lieferung des ASTRA. Ein Probelauf über 890 Situationen fand mit blosser
 * Wortgrenzen-Prüfung vier Treffer, von denen drei falsch waren:
 *
 *   "A9 Sion <-> Brig zwischen Anschluss Leuk/Susten-Ost …"  → "Susten"
 *   "Route de la Lienne <-> Route Du Simplon …"              → "Simplon"
 *   "A9 Brig <-> Domodossola … Ortschaft Simplon-Dorf …"     → "Simplon"
 *
 * Susten ist auch ein Dorf im Wallis, Simplon eine Strasse und ein Dorf. Ein
 * Passname allein ist in der Schweiz also kein Beleg für einen Pass — und der
 * Preis eines falschen Treffers ist hoch: er sperrt eine offene Passstrasse
 * in der Anzeige.
 *
 * Der Feed schreibt Pässe selbst konsequent mit ihrem Gattungswort:
 * "Pass Gotthard-Pass", "Pass Jaun-Pass", "Col Col du St-Gothard". Genau
 * darauf stützt sich die Regel: entweder trägt der Suchbegriff das Wort
 * selbst, oder unmittelbar vor dem Fund steht es.
 */
function begriffTrifft(text: string, begriff: string): boolean {
  const geschuetzt = begriff.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ausdruck = new RegExp(`(?<![\\p{L}\\p{N}])${geschuetzt}(?![\\p{L}\\p{N}])`, "giu");

  // Ein Begriff, der "Pass"/"Col"/"Passo" selbst führt, spricht für sich.
  if (BEGRIFF_MEINT_PASS.test(begriff)) return ausdruck.test(text);

  // Sonst muss das Gattungswort unmittelbar davor stehen.
  for (const fund of text.matchAll(ausdruck)) {
    const davor = text.slice(Math.max(0, fund.index - 14), fund.index);
    if (/(?:^|[^\p{L}])(?:pass|col|passo|passh[öo]he)[\s-]*$/iu.test(davor)) return true;
  }
  return false;
}

/**
 * Welche Pässe eine Situation betrifft. Eine Meldung kann mehrere nennen
 * ("Furka- und Grimselpass gesperrt") und erzeugt dann je einen Treffer.
 */
export function ordneMeldungZu(situation: DatexSituation, paesse: PassMuster[]): PassTreffer[] {
  if (situation.aufgehoben) return [];

  const text = situation.texte.join(" · ");
  if (text.length === 0) return [];

  const zustand = deuteMeldung(situation.texte, situation.typen);
  if (!zustand) return [];

  const nennt_tunnel = TUNNEL.test(text);

  const treffer: PassTreffer[] = [];
  for (const pass of paesse) {
    const passender = pass.suchbegriffe.find((begriff) => begriffTrifft(text, begriff));
    if (!passender) continue;
    // Die Tunnelregel: "Gotthard-Strassentunnel gesperrt" ist keine Aussage
    // über die Tremola, und "Furka-Autoverlad" keine über den Furkapass.
    if (nennt_tunnel && !BEGRIFF_MEINT_PASS.test(passender)) continue;

    treffer.push({
      situationId: situation.id,
      passId: pass.id,
      zustand,
      text: text.slice(0, 2000),
      gueltigVon: situation.gueltigVon,
      gueltigBis: situation.gueltigBis,
      versionAm: situation.versionAm ?? new Date().toISOString(),
    });
  }

  return treffer;
}

// ---------------------------------------------------------------------------
// Vom Meldungsbestand zum Status
// ---------------------------------------------------------------------------

const RANG: Record<MeldungsZustand, number> = {
  eingeschraenkt: 1,
  gesperrt: 2,
  wintersperre: 3,
};

export interface AktiveMeldung {
  zustand: MeldungsZustand;
  text: string;
  gueltigVon: string | null;
  gueltigBis: string | null;
}

export function istAktiv(meldung: AktiveMeldung, jetzt: Date): boolean {
  if (meldung.gueltigVon && new Date(meldung.gueltigVon) > jetzt) return false;
  if (meldung.gueltigBis && new Date(meldung.gueltigBis) <= jetzt) return false;
  return true;
}

/**
 * Die Monate, in denen ein Pass erfahrungsgemäss zu ist — ohne den ersten und
 * letzten der Spanne.
 *
 * Der Rand ist der Grund: eine Spanne "Oktober bis Mai" heisst nicht, dass der
 * Pass am 1. Oktober zu ist, sondern dass er irgendwann im Oktober schliesst
 * und irgendwann im Mai öffnet. In genau diesen beiden Monaten wäre "zu" so
 * oft falsch wie richtig, also gilt dort weiter, was der Feed sagt.
 */
export function istKernWintermonat(
  monat: number,
  ab: number | null,
  bis: number | null,
): boolean {
  if (ab === null || bis === null) return false;
  // Eine Spanne von höchstens zwei Monaten hat keinen Kern: nähme man ihr
  // beide Ränder, bliebe nichts übrig — und die Formel unten schlüge in die
  // Gegenrichtung um und erklärte fast das ganze Jahr zum Winter.
  const spanne = ((bis - ab + 12) % 12) + 1;
  if (spanne <= 2) return false;
  const kernAb = (ab % 12) + 1;
  const kernBis = ((bis + 10) % 12) + 1;
  // Die Kernspanne kann über den Jahreswechsel laufen (November–April).
  return kernAb <= kernBis
    ? monat >= kernAb && monat <= kernBis
    : monat >= kernAb || monat <= kernBis;
}

export interface StatusAusMeldungen {
  zustand: PassZustand;
  meldung: string | null;
}

/**
 * Der Status eines Passes aus seinen aktiven Meldungen.
 *
 * Ohne Meldung gilt der Pass als offen — das ist die Aussage des Feeds
 * ("nichts gemeldet"), und die App beschriftet sie auch so. Zwei Ausnahmen:
 * im Kernwinter eines saisonalen Passes und bei ungesundem Feed sagen wir
 * lieber nichts, als etwas Falsches.
 */
export function statusAusMeldungen(
  meldungen: AktiveMeldung[],
  optionen: {
    jetzt: Date;
    feedGesund: boolean;
    wintersperreAbMonat: number | null;
    wintersperreBisMonat: number | null;
  },
): StatusAusMeldungen {
  if (!optionen.feedGesund) return { zustand: "unbekannt", meldung: null };

  const aktive = meldungen.filter((m) => istAktiv(m, optionen.jetzt));

  if (aktive.length > 0) {
    const schlimmste = aktive.reduce((a, b) => (RANG[b.zustand] > RANG[a.zustand] ? b : a));
    return { zustand: schlimmste.zustand, meldung: schlimmste.text.slice(0, 500) };
  }

  // Der Monat in Schweizer Ortszeit, nicht in der des Servers: auf Vercel
  // läuft der in UTC, und an einem Monatsende entschiede sonst eine bis zu
  // zwei Stunden alte Zeitzone darüber, ob ein Pass im Kernwinter steht.
  const monat = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", month: "numeric" }).format(
      optionen.jetzt,
    ),
  );
  if (istKernWintermonat(monat, optionen.wintersperreAbMonat, optionen.wintersperreBisMonat)) {
    return { zustand: "unbekannt", meldung: null };
  }

  return { zustand: "offen", meldung: null };
}
