// Auswertung der eigenen Fahrten über die Zeit und über die Fahrzeuge —
// die Datengrundlage der Premium-Statistik auf der Profilseite.
//
// ---------------------------------------------------------------------------
// Warum hier keine Zeit und kein Tempo vorkommt
// ---------------------------------------------------------------------------
// Zwei unabhängige Gründe, und beide zeigen in dieselbe Richtung:
//
//   1. **Belastbarkeit.** Von den drei Beinen des Audit-Befunds A1
//      (docs/audit/README.md) sind zwei geschlossen: die Trigger aus 0052,
//      0059 und 0074 rechnen Abdeckung neu und begrenzen die Werte, 0078
//      macht die Abdeckung richtungsempfindlich. Offen ist genau eines —
//      dauer_sekunden. Die Dauer entsteht zwar serverseitig aus dem Trail
//      (lib/actions/completions.ts → computeTrailStats), aber die
//      Zeitstempel im Trail kommen vom Client: ein echter Track mit ×0,4
//      gestauchten Zeiten bleibt im 200-km/h-Band aus 0059 und kommt durch.
//      distanz_km dagegen wird in 0059 gegen st_length(track) gegengeprüft,
//      hoehenmeter_aufstieg stammt aus dem Höhenprofil. Diese beiden Zahlen
//      und die blosse Anzahl sind das, was sich verkaufen lässt.
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

export interface FahrtFuerStatistik {
  /** DATE-Spalte, Format "YYYY-MM-DD". */
  datum: string;
  distanz_km: number | null;
  hoehenmeter_aufstieg: number | null;
  fahrzeug_id: string | null;
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
  /** Differenz der Kilometer zum Vorjahr. null für das älteste Jahr und
   *  für jedes Jahr, dessen Vorjahr keine Fahrt enthält — eine Lücke ist
   *  kein Rückgang auf null, und ein erfundener Vergleichswert wäre die
   *  schlechtere Antwort als gar keiner. */
  kmGegenVorjahr: number | null;
}

export interface FahrzeugZeile extends StatistikZeile {
  /** null sammelt alle Fahrten ohne zugeordnetes Fahrzeug. Die Spalte ist
   *  "on delete set null" (0001) — wer ein Fahrzeug löscht, verliert seine
   *  Fahrten nicht, sie verlieren nur die Zuordnung. */
  fahrzeugId: string | null;
}

/** Jahr aus "YYYY-MM-DD", oder null wenn die Zeichenkette nicht passt. */
export function jahrAus(datum: string): number | null {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (!treffer) return null;
  const jahr = Number(treffer[1]);
  return Number.isFinite(jahr) ? jahr : null;
}

/** Monat (1-12) aus "YYYY-MM-DD", oder null. */
export function monatAus(datum: string): number | null {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (!treffer) return null;
  const monat = Number(treffer[2]);
  return monat >= 1 && monat <= 12 ? monat : null;
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

  const jahre = [...nachJahr.keys()].sort((a, b) => b - a);

  return jahre.map((jahr) => {
    const gerundet = runde(nachJahr.get(jahr)!);
    const vorjahr = nachJahr.get(jahr - 1);
    return {
      jahr,
      ...gerundet,
      kmGegenVorjahr:
        vorjahr === undefined ? null : Math.round((gerundet.km - runde(vorjahr).km) * 10) / 10,
    };
  });
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
 * Zwölf Zahlen: wie viele Fahrten in welchem Monat des gegebenen Jahres.
 * Index 0 ist Januar.
 *
 * Anders als bei den Jahren sind die Nullen hier der Inhalt — die Kurve
 * eines Fahrjahres besteht gerade darin, dass von November bis Februar
 * nichts passiert.
 */
export function fahrtenProMonat(
  fahrten: readonly FahrtFuerStatistik[],
  jahr: number,
): number[] {
  const monate = new Array<number>(12).fill(0);

  for (const fahrt of fahrten) {
    if (jahrAus(fahrt.datum) !== jahr) continue;
    const monat = monatAus(fahrt.datum);
    if (monat === null) continue;
    monate[monat - 1] += 1;
  }

  return monate;
}
