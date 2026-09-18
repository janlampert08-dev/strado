// Auswertung der eigenen Fahrten über die Zeit, die Fahrzeuge und die
// Regionen — die Datengrundlage der Premium-Statistik auf der Profilseite.
//
// ---------------------------------------------------------------------------
// Warum hier keine Zeit und kein Tempo vorkommt
// ---------------------------------------------------------------------------
// Zwei unabhängige Gründe, und beide zeigen in dieselbe Richtung:
//
//   1. **Belastbarkeit.** Von den drei Beinen des Audit-Befunds A1
//      (docs/audit/README.md) sind zwei geschlossen: die Trigger aus 0052,
//      0059 und 0074 rechnen Abdeckung neu und begrenzen die Werte, 0078
//      macht die Abdeckung richtungsempfindlich. Das dritte —
//      dauer_sekunden — ist seit 0096–0098 hart eingeschnürt (Serverstart,
//      Positionspulse, Endpunktprüfung), aber ausdrücklich NICHT
//      geschlossen: die Position in einem Puls kommt wie jeder GPS-Fix vom
//      Gerät. distanz_km dagegen wird in 0059 gegen st_length(track)
//      gegengeprüft, hoehenmeter_aufstieg stammt aus dem Höhenprofil. Diese
//      beiden Zahlen und die blosse Anzahl sind das, was sich verkaufen
//      lässt.
//   2. **AGB Ziff. 11.3.** „Strado ist kein Wettbewerb um Geschwindigkeit."
//      Eine Auswertung, die jemandem sein steigendes Durchschnittstempo
//      vorhält, arbeitet gegen den eigenen Rechtstext — und gegen Ziff.
//      11.4, die das Unterbieten einer geführten Zeit ausdrücklich
//      untersagt.
//
// Wer diese Datei später um Dauer oder Tempo erweitern will, muss zuerst
// A1 Bein 2 schliessen UND Ziff. 11.3 ändern. Beides zusammen, nicht eines.
//
// ---------------------------------------------------------------------------
// Warum das Datum als Zeichenkette zerlegt wird
// ---------------------------------------------------------------------------
// route_completions.datum ist eine DATE-Spalte und kommt als "YYYY-MM-DD".
// `new Date("2026-01-01")` ist nach ECMA-262 Mitternacht **UTC**; in jeder
// Zone westlich davon liefert getFullYear() dann 2025. Eine Fahrt vom
// 1. Januar landete so im Vorjahr, und zwar nur für einen Teil der Nutzer.
// Deshalb wird die Zeichenkette zerlegt und nie in ein Date verwandelt.
//
// Aus demselben Grund vergleicht saisonVergleich() Zeichenketten der Form
// "MM-TT" statt Zeitpunkte: "09-16" <= "09-16" ist eine lexikografische
// Prüfung, die in jeder Zone dasselbe Ergebnis liefert.
//
// ---------------------------------------------------------------------------
// Warum der Jahresvergleich ein Fenster hat
// ---------------------------------------------------------------------------
// Bis hierher stellte die Auswertung dem laufenden Jahr das VOLLE Vorjahr
// gegenüber (kmGegenVorjahr). Das ist bis zum 31. Dezember jedes Jahres
// falsch, und zwar systematisch zu Ungunsten der Nutzerin: im Februar stehen
// sechs Wochen gegen zwölf Monate, und die Auswertung, für die jemand
// bezahlt, meldet als Erstes einen Einbruch, den es nicht gibt. Verglichen
// wird deshalb derselbe Zeitraum — 1. Januar bis zum heutigen Tag, in beiden
// Jahren. Ist das betrachtete Jahr abgeschlossen (die letzte Fahrt liegt in
// einem früheren Jahr), läuft das Fenster bis zum 31. Dezember und der
// Vergleich ist wieder der volle.

export interface FahrtFuerStatistik {
  /** DATE-Spalte, Format "YYYY-MM-DD". */
  datum: string;
  distanz_km: number | null;
  hoehenmeter_aufstieg: number | null;
  fahrzeug_id: string | null;
  /** Die befahrene Strecke; null bei freien Fahrten (0044). Grundlage für
   *  die Zahl der in einer Saison neu entdeckten Strecken. */
  route_id: string | null;
  /** Bei Streckenfahrten aus routes.region, bei freien Fahrten aus
   *  route_completions.region (0044) — beides kann fehlen, wenn das
   *  Reverse-Geocoding nichts geliefert hat. */
  region: string | null;
}

export interface StatistikZeile {
  fahrten: number;
  /** Auf eine Nachkommastelle gerundet — die Summe vieler numeric-Werte
   *  liefert sonst 1234.5999999999999 in der Anzeige. */
  km: number;
  /** Ganze Meter, wie summiereHoehenmeter in lib/hoehenmeter.ts. */
  hoehenmeter: number;
}

export interface JahresZeile extends StatistikZeile {
  jahr: number;
}

export interface FahrzeugZeile extends StatistikZeile {
  /** null sammelt alle Fahrten ohne zugeordnetes Fahrzeug. Die Spalte ist
   *  "on delete set null" (0001) — wer ein Fahrzeug löscht, verliert seine
   *  Fahrten nicht, sie verlieren nur die Zuordnung. */
  fahrzeugId: string | null;
}

export interface RegionZeile extends StatistikZeile {
  /** null sammelt alle Fahrten ohne bekannte Region. */
  region: string | null;
}

export interface SaisonVergleich {
  jahr: number;
  /** Das Jahr läuft noch — der Vergleich ist dann auf den heutigen Tag
   *  beschnitten und die Oberfläche muss das dazusagen. */
  laufend: boolean;
  /** Ende des Vergleichsfensters als "MM-TT". */
  bisTag: string;
  aktuell: StatistikZeile;
  /**
   * Derselbe Zeitraum im Vorjahr — null, wenn das Vorjahr überhaupt keine
   * Fahrt enthält. Eine Lücke ist kein Rückgang auf null, und ein
   * erfundener Vergleichswert wäre die schlechtere Antwort als gar keiner.
   *
   * Eine Null STEHT dagegen, wenn im Vorjahr zwar gefahren wurde, aber erst
   * nach dem Stichtag: „+420 km gegenüber der letzten Saison" ist dann die
   * richtige Aussage über dieses Fenster, und der Fussnotensatz der
   * Oberfläche nennt das Fenster.
   */
  vorjahr: StatistikZeile | null;
}

export interface StreckenBilanz {
  /** Strecken, deren allererste Befahrung in dieses Jahr fällt. */
  neuImJahr: number;
  /** Verschiedene Strecken über alle Jahre. */
  gesamt: number;
}

export interface Rekord {
  wert: number;
  datum: string;
}

export interface Rekorde {
  /** Kilometer der längsten einzelnen Fahrt. */
  laengsteFahrt: Rekord | null;
  /** Höhenmeter der Fahrt mit dem grössten Anstieg. */
  hoechsterAnstieg: Rekord | null;
  /** Der Monat mit den meisten Kilometern, über alle Jahre. */
  staerksterMonat: { jahr: number; monat: number; km: number } | null;
}

const DATUM_MUSTER = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jahr aus "YYYY-MM-DD", oder null wenn die Zeichenkette nicht passt. */
export function jahrAus(datum: string): number | null {
  const treffer = DATUM_MUSTER.exec(datum);
  if (!treffer) return null;
  const jahr = Number(treffer[1]);
  return Number.isFinite(jahr) ? jahr : null;
}

/** Monat (1-12) aus "YYYY-MM-DD", oder null. */
export function monatAus(datum: string): number | null {
  const treffer = DATUM_MUSTER.exec(datum);
  if (!treffer) return null;
  const monat = Number(treffer[2]);
  return monat >= 1 && monat <= 12 ? monat : null;
}

/**
 * Der Tag im Jahr als "MM-TT", oder null. Bewusst als Zeichenkette: zwei
 * solche Werte lassen sich direkt vergleichen, ohne dass irgendwo ein Date
 * und damit eine Zeitzone entsteht (siehe Kopf dieser Datei).
 */
export function tagImJahrAus(datum: string): string | null {
  const treffer = DATUM_MUSTER.exec(datum);
  if (!treffer) return null;
  return monatAus(datum) === null ? null : `${treffer[2]}-${treffer[3]}`;
}

function leereZeile(): StatistikZeile {
  return { fahrten: 0, km: 0, hoehenmeter: 0 };
}

function zaehle(zeile: StatistikZeile, fahrt: FahrtFuerStatistik): void {
  zeile.fahrten += 1;
  zeile.km += fahrt.distanz_km ?? 0;
  zeile.hoehenmeter += fahrt.hoehenmeter_aufstieg ?? 0;
}

function runde(zeile: StatistikZeile): StatistikZeile {
  return {
    fahrten: zeile.fahrten,
    km: Math.round(zeile.km * 10) / 10,
    hoehenmeter: Math.round(zeile.hoehenmeter),
  };
}

/** Summiert eine beliebige Auswahl von Fahrten zu einer fertigen Zeile. */
function summiere(fahrten: Iterable<FahrtFuerStatistik>): StatistikZeile {
  const zeile = leereZeile();
  for (const fahrt of fahrten) zaehle(zeile, fahrt);
  return runde(zeile);
}

/**
 * Ein Eintrag pro Jahr mit mindestens einer Fahrt, neuestes zuerst.
 *
 * Jahre ohne Fahrt tauchen NICHT als Nullzeile auf: eine Pause ist kein
 * Ereignis, und eine Liste voller Nullen macht aus drei echten Jahren eine
 * Tabelle mit zehn Zeilen.
 */
export function fahrtenProJahr(fahrten: readonly FahrtFuerStatistik[]): JahresZeile[] {
  const nachJahr = new Map<number, StatistikZeile>();

  for (const fahrt of fahrten) {
    const jahr = jahrAus(fahrt.datum);
    if (jahr === null) continue;
    const zeile = nachJahr.get(jahr) ?? leereZeile();
    zaehle(zeile, fahrt);
    nachJahr.set(jahr, zeile);
  }

  return [...nachJahr.keys()]
    .sort((a, b) => b - a)
    .map((jahr) => ({ jahr, ...runde(nachJahr.get(jahr)!) }));
}

/**
 * Ein Eintrag pro Fahrzeug, nach Kilometern absteigend. Fahrten ohne
 * Fahrzeug stehen als eigene Zeile mit fahrzeugId = null am Ende — sie
 * verschwinden nicht, sonst summierten sich die Zeilen nicht mehr auf die
 * Gesamtzahl, die eine Kachel darüber anzeigt.
 */
export function fahrtenProFahrzeug(fahrten: readonly FahrtFuerStatistik[]): FahrzeugZeile[] {
  const nachFahrzeug = new Map<string | null, StatistikZeile>();

  for (const fahrt of fahrten) {
    const schluessel = fahrt.fahrzeug_id;
    const zeile = nachFahrzeug.get(schluessel) ?? leereZeile();
    zaehle(zeile, fahrt);
    nachFahrzeug.set(schluessel, zeile);
  }

  return [...nachFahrzeug.entries()]
    .map(([fahrzeugId, zeile]) => ({ fahrzeugId, ...runde(zeile) }))
    .sort((a, b) => {
      if (a.fahrzeugId === null) return 1;
      if (b.fahrzeugId === null) return -1;
      return b.km - a.km;
    });
}

/**
 * Ein Eintrag pro Region, nach Kilometern absteigend; Fahrten ohne bekannte
 * Region sammeln sich in einer Zeile mit region = null am Ende — aus
 * demselben Grund wie bei den Fahrzeugen: die Zeilen müssen sich auf die
 * Gesamtsumme aufaddieren, sonst beschreiben sie einen anderen Bestand als
 * die Kacheln darüber.
 *
 * Die Region ist im Produkt die Einheit des Wiedererkennens (AGENTS.md:
 * „Das Ortsschild ist die Einheit des Wiedererkennens") — sie beantwortet
 * die einzige Frage, die weder Jahr noch Fahrzeug beantwortet: wo war ich
 * eigentlich?
 *
 * DIESE AUSWERTUNG GEHÖRT AUF DIE EIGENE PROFILSEITE UND NIRGENDWO SONST.
 * Bei einer freien Fahrt stammt die Region aus dem UNGEKÜRZTEN Startpunkt
 * (`lib/actions/completions.ts` → `reverseGeocode(coordinates[0])`); die
 * Privatzonen-Kürzung in `lib/track.ts` läuft getrennt davon und nur für
 * den veröffentlichten Track. Die Körnung ist ausserdem nicht garantiert
 * kantonal: `lib/geocoding.ts` fällt auf den Ortsnamen zurück, wenn Mapbox
 * kein `region`-Feature liefert. Eine nach Anteil sortierte Regionenliste
 * ist damit eine Liste der Heimatgegend — auf `/profil` sieht sie nur die
 * Person selbst, auf `app/fahrer/[id]`, im Feed oder in einem Teilbild wäre
 * sie eine Preisgabe. Der Feed zeigt heute schon einzelne Regionen
 * (`public_fahrten` seit 0045); die Rangliste über alle Fahrten ist eine
 * andere Aussage als ein einzelner Ortsbezug.
 */
export function fahrtenProRegion(fahrten: readonly FahrtFuerStatistik[]): RegionZeile[] {
  // Gruppiert wird auf der kleingeschriebenen Fassung, angezeigt wird die
  // zuerst gesehene Schreibweise. Der Schlüssel kommt aus zwei Quellen —
  // routes.region ist von der Moderation getippt, route_completions.region
  // vom Reverse-Geocoding — und „Zürich" neben „zürich" wären sonst zwei
  // Zeilen mit je halbem Anteil.
  const nachRegion = new Map<string | null, { name: string | null; zeile: StatistikZeile }>();

  for (const fahrt of fahrten) {
    // Leerstring wie „nicht gesetzt" behandeln: die Spalte ist nur
    // längenbegrenzt (0074), nicht gegen Leerzeichen geschützt.
    const roh = fahrt.region?.trim();
    const name = roh ? roh : null;
    const schluessel = name === null ? null : name.toLowerCase();
    const eintrag = nachRegion.get(schluessel) ?? { name, zeile: leereZeile() };
    zaehle(eintrag.zeile, fahrt);
    nachRegion.set(schluessel, eintrag);
  }

  return [...nachRegion.values()]
    .map(({ name, zeile }) => ({ region: name, ...runde(zeile) }))
    .sort((a, b) => {
      if (a.region === null) return 1;
      if (b.region === null) return -1;
      return b.km - a.km;
    });
}

/**
 * Zwölf Zeilen: Fahrten, Kilometer und Höhenmeter je Monat des gegebenen
 * Jahres. Index 0 ist Januar.
 *
 * Anders als bei den Jahren sind die Nullen hier der Inhalt — die Kurve
 * eines Fahrjahres besteht gerade darin, dass von November bis Februar
 * nichts passiert.
 *
 * Die Vorgängerfunktion lieferte nur die ANZAHL. Das ist die schwächste der
 * drei Zahlen: eine Feierabendrunde und eine Alpentour zählen gleich viel,
 * und genau den Unterschied soll eine Saisonkurve zeigen.
 */
export function monatsWerte(
  fahrten: readonly FahrtFuerStatistik[],
  jahr: number,
): StatistikZeile[] {
  const monate = Array.from({ length: 12 }, leereZeile);

  for (const fahrt of fahrten) {
    if (jahrAus(fahrt.datum) !== jahr) continue;
    const monat = monatAus(fahrt.datum);
    if (monat === null) continue;
    zaehle(monate[monat - 1], fahrt);
  }

  return monate.map(runde);
}

/**
 * Das betrachtete Jahr gegen dasselbe Fenster des Vorjahres.
 *
 * `heute` ist das aktuelle Kalenderdatum als "YYYY-MM-DD" — auf der
 * Profilseite todayInZurich() aus lib/format.ts. Als Parameter statt als
 * Uhrzeit-Zugriff, damit die Funktion rein bleibt und der Fall „1. Januar"
 * prüfbar ist.
 */
export function saisonVergleich(
  fahrten: readonly FahrtFuerStatistik[],
  jahr: number,
  heute: string,
): SaisonVergleich {
  const heuteJahr = jahrAus(heute);
  const heuteTag = tagImJahrAus(heute);
  // Läuft das betrachtete Jahr noch? Nur dann wird das Fenster beschnitten.
  // Ein unlesbares `heute` fällt bewusst auf „abgeschlossen" zurück statt
  // alles zu verwerfen: der volle Jahresvergleich ist die harmlosere
  // falsche Antwort.
  const laufend = heuteJahr === jahr && heuteTag !== null;
  const bisTag = laufend ? heuteTag! : "12-31";

  const imFenster = (fahrt: FahrtFuerStatistik, zielJahr: number) => {
    if (jahrAus(fahrt.datum) !== zielJahr) return false;
    const tag = tagImJahrAus(fahrt.datum);
    return tag !== null && tag <= bisTag;
  };

  const vorjahrHatFahrten = fahrten.some((f) => jahrAus(f.datum) === jahr - 1);

  return {
    jahr,
    laufend,
    bisTag,
    aktuell: summiere(fahrten.filter((f) => imFenster(f, jahr))),
    vorjahr: vorjahrHatFahrten
      ? summiere(fahrten.filter((f) => imFenster(f, jahr - 1)))
      : null,
  };
}

/**
 * Wie viele verschiedene Strecken im gegebenen Jahr zum ERSTEN Mal befahren
 * wurden, und wie viele es über alle Jahre sind.
 *
 * „Neu" heisst: die früheste Befahrung dieser Strecke fällt in dieses Jahr.
 * Eine zum zehnten Mal gefahrene Hausrunde ist keine Entdeckung.
 *
 * `gesamt` ist NICHT dieselbe Zahl wie die Kachel „Pässe befahren" weiter
 * oben auf der Profilseite, auch wenn beide „verschiedene Strecken über die
 * gesamte Zeit" zählen. Die Kachel zählt auf einer eigenen Abfrage ohne
 * Dauerfilter; diese Funktion sieht nur die Fahrten, die
 * `app/profil/page.tsx` mit `.not("dauer_sekunden", "is", null)` holt, und
 * `dauer_sekunden` ist seit 0008_tracking.sql ausdrücklich optional. Ein
 * Konto mit alten, ungetimten Fahrten liest oben also eine grössere Zahl als
 * hier. Beides ist für sich richtig — wer die beiden angleichen will, muss
 * die Grundgesamtheit angleichen, nicht diese Funktion.
 *
 * Freie Fahrten (route_id = null) bleiben aussen vor: sie haben keine
 * Strecke, die man wiedererkennen könnte.
 */
export function streckenBilanz(
  fahrten: readonly FahrtFuerStatistik[],
  jahr: number,
): StreckenBilanz {
  const erstesJahr = new Map<string, number>();

  for (const fahrt of fahrten) {
    if (fahrt.route_id === null) continue;
    const fahrtJahr = jahrAus(fahrt.datum);
    if (fahrtJahr === null) continue;
    const bisher = erstesJahr.get(fahrt.route_id);
    if (bisher === undefined || fahrtJahr < bisher) {
      erstesJahr.set(fahrt.route_id, fahrtJahr);
    }
  }

  let neuImJahr = 0;
  for (const wert of erstesJahr.values()) if (wert === jahr) neuImJahr += 1;

  return { neuImJahr, gesamt: erstesJahr.size };
}

/**
 * Drei Bestwerte, alle aus den belastbaren Grössen (Distanz, Anstieg,
 * Kilometer je Monat) — bewusst keine Bestzeit, siehe Kopf dieser Datei.
 *
 * Bei Gleichstand gewinnt die zuerst übergebene Fahrt. Die Profilseite
 * liefert die neuesten zuerst, ein Gleichstand zeigt also die jüngere
 * Fahrt.
 */
export function rekorde(fahrten: readonly FahrtFuerStatistik[]): Rekorde {
  // Der Vergleich läuft auf den ROHEN Werten, gerundet wird erst bei der
  // Ausgabe. Andernfalls stünde links ein ungerundeter und rechts ein schon
  // gerundeter Wert, und eine kleinere Fahrt könnte eine grössere verdrängen:
  // 120.04 km wird als 120 gemerkt, 120.02 km ist grösser als diese 120 und
  // überschreibt sie. Die angezeigte ZAHL bliebe dabei richtig — falsch würde
  // das Datum daneben, und bei einem Bestwert ist „welche Fahrt war das"
  // die interessantere Hälfte.
  let laengsteRoh = 0;
  let hoechsterRoh = 0;
  let laengsteFahrt: Rekord | null = null;
  let hoechsterAnstieg: Rekord | null = null;
  const kmProMonat = new Map<string, { jahr: number; monat: number; km: number }>();

  for (const fahrt of fahrten) {
    const jahr = jahrAus(fahrt.datum);
    const monat = monatAus(fahrt.datum);
    if (jahr === null || monat === null) continue;

    const km = fahrt.distanz_km ?? 0;
    const hm = fahrt.hoehenmeter_aufstieg ?? 0;

    // Echt grösser, nie grösser-gleich: so gewinnt bei Gleichstand die
    // zuerst übergebene Fahrt, wie der Docstring oben zusagt.
    if (km > 0 && km > laengsteRoh) {
      laengsteRoh = km;
      laengsteFahrt = { wert: Math.round(km * 10) / 10, datum: fahrt.datum };
    }
    if (hm > 0 && hm > hoechsterRoh) {
      hoechsterRoh = hm;
      hoechsterAnstieg = { wert: Math.round(hm), datum: fahrt.datum };
    }

    const schluessel = `${jahr}-${monat}`;
    const eintrag = kmProMonat.get(schluessel) ?? { jahr, monat, km: 0 };
    eintrag.km += km;
    kmProMonat.set(schluessel, eintrag);
  }

  // Verglichen wird roh, gerundet erst bei der Ausgabe — wie laengsteRoh
  // oben: sonst schlägt ein Monat mit 120.02 km einen mit 120.04 km, weil
  // dieser schon auf 120.0 abgerundet dasteht.
  let staerksterRoh = 0;
  let staerksterMonat: { jahr: number; monat: number; km: number } | null = null;
  for (const eintrag of kmProMonat.values()) {
    if (eintrag.km <= 0) continue;
    if (staerksterMonat === null || eintrag.km > staerksterRoh) {
      staerksterRoh = eintrag.km;
      staerksterMonat = { ...eintrag, km: Math.round(eintrag.km * 10) / 10 };
    }
  }

  return { laengsteFahrt, hoechsterAnstieg, staerksterMonat };
}
