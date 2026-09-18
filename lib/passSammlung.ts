// Die Pass-Sammlung: welche freigegebenen Passstrassen jemand schon gefahren
// hat, wann zum ersten Mal, wie oft — und welche noch offen sind.
//
// Reine Rechnung ohne Datenbank und ohne Server-Import, damit sie unter
// Vitest prüfbar bleibt und eine Client-Komponente sie importieren darf (die
// Falle aus lib/premiumLimits.ts: ein Import von lib/supabase/** zieht
// next/headers in den Client). Die Abfragen dazu liegen in
// lib/passSammlungDaten.ts.
//
// ---------------------------------------------------------------------------
// Was hier bewusst NICHT vorkommt
// ---------------------------------------------------------------------------
// Keine Zeit, kein Tempo, keine Rangliste. Dieselben zwei Gründe wie im Kopf
// von lib/fahrtstatistik.ts (Audit-Befund A1, Bein 2, und AGB Ziff. 11.3):
// eine Sammlung zählt, WO jemand war, nicht wie schnell. Wer das erweitern
// will, liest zuerst dort nach.
//
// ---------------------------------------------------------------------------
// Die Grundmenge ist der Passkatalog (0104), nicht die Streckenliste
// ---------------------------------------------------------------------------
// Bis 2026-09-18 zählte diese Sammlung Strecken der Kategorie "passstrasse"
// und nur Streckenfahrten. Daneben zählte die freie Passsammlung aus 0104
// Passhöhen über den Track — zwei Zahlen mit derselben Überschrift auf
// derselben Seite. Entscheid des Inhabers: eine Quelle. Grundmenge ist jetzt
// `paesse`, gezählt wird über `meine_passfahrten()` (0113): jede eigene
// Fahrt, deren Track einem Scheitel auf 150 m nahekommt — auch eine freie
// Fahrt über den Klausen. "3 von 34" ist damit für alle derselbe Nenner und
// dieselbe Zahl wie auf /paesse. Die Kachel "Pässe befahren" auf der
// Profilseite zählt weiterhin Strecken und wird hier nicht umdefiniert.

import { jahrAus } from "@/lib/fahrtstatistik";

/** Ein Pass aus dem Katalog (`paesse`, 0104). */
export interface PassStrecke {
  /** Kürzel des Passes, z. B. "klausen" — kein Strecken-UUID. */
  id: string;
  name: string;
  /** Kantone, z. B. "UR · GL". */
  region: string | null;
  /** Scheitelhöhe in Metern. */
  hoehe_m: number | null;
}

/** Eine eigene Fahrt über einen Pass, wie `meine_passfahrten()` sie liefert. */
export interface PassFahrt {
  pass_id: string;
  /** DATE-Spalte, "YYYY-MM-DD". */
  datum: string;
}

export interface GefahrenerPass extends PassStrecke {
  /** "YYYY-MM-DD" der ersten Fahrt. */
  ersteFahrt: string;
  anzahl: number;
}

export interface PassSammlung {
  gefahren: GefahrenerPass[];
  offen: PassStrecke[];
  anzahlGefahren: number;
  anzahlGesamt: number;
  /** Der höchste gefahrene Pass mit bekannter Scheitelhöhe, sonst null. */
  hoechsterPass: GefahrenerPass | null;
}

// Schweizer Sortierung: "Übergang" steht bei U, nicht hinter Z. localeCompare
// ohne Locale hinge von der Laufzeit ab und könnte zwischen Server und
// Browser verschieden sortieren.
const sortierer = new Intl.Collator("de-CH", { sensitivity: "base" });

/**
 * Baut die Sammlung aus dem Katalog und den eigenen Passfahrten.
 *
 * Gefahrene Pässe stehen in der Reihenfolge, in der sie dazukamen — älteste
 * erste Fahrt zuerst. Das ist die Lesart "Pass für Pass": eine Sammlung
 * erzählt, wie sie gewachsen ist, und eine Sortierung nach Höhe machte daraus
 * eine Rangliste. Bei gleichem Datum entscheidet der Name, damit die Liste
 * bei jedem Aufruf gleich aussieht.
 *
 * Offene Pässe stehen alphabetisch: eine Einladung hat keine Reihenfolge.
 */
export function baueSammlung(
  paesse: readonly PassStrecke[],
  fahrten: readonly PassFahrt[],
): PassSammlung {
  const nachId = new Map<string, { ersteFahrt: string; anzahl: number }>();
  const grundmenge = new Set(paesse.map((p) => p.id));

  for (const fahrt of fahrten) {
    if (!grundmenge.has(fahrt.pass_id)) continue;
    // Ein unlesbares Datum zählt nicht: als "erste Fahrt" liesse es sich
    // weder sortieren noch anzeigen, und raten wäre schlechter als weglassen.
    if (jahrAus(fahrt.datum) === null) continue;
    const bisher = nachId.get(fahrt.pass_id);
    if (!bisher) {
      nachId.set(fahrt.pass_id, { ersteFahrt: fahrt.datum, anzahl: 1 });
    } else {
      bisher.anzahl += 1;
      // "YYYY-MM-DD" sortiert als Zeichenkette richtig — kein Date nötig,
      // und damit auch keine Zeitzonenfalle (siehe lib/fahrtstatistik.ts).
      if (fahrt.datum < bisher.ersteFahrt) bisher.ersteFahrt = fahrt.datum;
    }
  }

  const gefahren: GefahrenerPass[] = [];
  const offen: PassStrecke[] = [];
  // Doppelte Zeilen in der Grundmenge (sollte es nicht geben, aber eine
  // Abfrage ohne distinct kann sie liefern) dürfen den Nenner nicht aufblähen.
  const gesehen = new Set<string>();
  for (const pass of paesse) {
    if (gesehen.has(pass.id)) continue;
    gesehen.add(pass.id);
    const eintrag = nachId.get(pass.id);
    if (eintrag) gefahren.push({ ...pass, ...eintrag });
    else offen.push(pass);
  }

  gefahren.sort(
    (a, b) =>
      (a.ersteFahrt < b.ersteFahrt ? -1 : a.ersteFahrt > b.ersteFahrt ? 1 : 0) ||
      sortierer.compare(a.name, b.name),
  );
  offen.sort((a, b) => sortierer.compare(a.name, b.name));

  let hoechsterPass: GefahrenerPass | null = null;
  for (const pass of gefahren) {
    if (pass.hoehe_m === null) continue;
    if (hoechsterPass === null || pass.hoehe_m > (hoechsterPass.hoehe_m ?? -Infinity)) {
      hoechsterPass = pass;
    }
  }

  return {
    gefahren,
    offen,
    anzahlGefahren: gefahren.length,
    anzahlGesamt: gesehen.size,
    hoechsterPass,
  };
}

/** "2026-07-12" → "12.07.2026", ohne Umweg über Date (Zeitzone). */
export function datumAnzeige(datum: string): string {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : datum;
}

/** Scheitelhöhe in Schweizer Schreibweise: "2'478 m". */
export function hoeheAnzeige(meter: number): string {
  return `${Math.round(meter).toLocaleString("de-CH")} m`;
}
