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
// Warum die Grundmenge nur öffentliche Pässe sind
// ---------------------------------------------------------------------------
// "3 von 12" ist nur dann eine ehrliche Zahl, wenn die 12 für alle dieselbe
// ist. Eine private Passstrecke, die jemand für sich angelegt hat, oder eine
// abgelehnte, die noch in alten Fahrten hängt, gehört nicht in den Nenner —
// und deshalb auch nicht in den Zähler: sonst stünde "13 von 12" da. Fahrten
// auf Strecken ausserhalb der Grundmenge fallen hier also still heraus. Die
// Kachel "Pässe befahren" auf der Profilseite zählt anders (jede Strecke,
// siehe app/profil/page.tsx) — das ist eine bestehende Zahl mit eigener
// Geschichte und wird hier nicht umdefiniert.

import { jahrAus } from "@/lib/fahrtstatistik";

/** Eine freigegebene, öffentliche Strecke der Kategorie "passstrasse". */
export interface PassStrecke {
  id: string;
  name: string;
  /** Freitext aus routes.region, meist der Kanton. */
  region: string | null;
  /** Scheitelhöhe der Strecke (routes.hoehe_m) — der höchste Punkt, nicht
   *  der kumulierte Anstieg. Kann fehlen. */
  hoehe_m: number | null;
}

/** Eine eigene Streckenfahrt, so knapp wie die Sammlung sie braucht. */
export interface StreckenFahrt {
  route_id: string | null;
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
 * Nur die Zahl: wie viele der Pässe aus der Grundmenge unter den eigenen
 * Fahrten vorkommen. Für den Hinweis ohne Abo, der nichts anderes zeigt —
 * er soll nicht die ganze Sammlung aufbauen, um eine Zahl daraus zu lesen.
 */
export function zaehleGefahrenePaesse(
  passIds: Iterable<string>,
  fahrten: readonly { route_id: string | null }[],
): number {
  const grundmenge = new Set(passIds);
  const gefahren = new Set<string>();
  for (const fahrt of fahrten) {
    if (fahrt.route_id !== null && grundmenge.has(fahrt.route_id)) gefahren.add(fahrt.route_id);
  }
  return gefahren.size;
}

/**
 * Baut die Sammlung aus der Grundmenge und den eigenen Streckenfahrten.
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
  fahrten: readonly StreckenFahrt[],
): PassSammlung {
  const nachId = new Map<string, { ersteFahrt: string; anzahl: number }>();
  const grundmenge = new Set(paesse.map((p) => p.id));

  for (const fahrt of fahrten) {
    if (fahrt.route_id === null || !grundmenge.has(fahrt.route_id)) continue;
    // Ein unlesbares Datum zählt nicht: als "erste Fahrt" liesse es sich
    // weder sortieren noch anzeigen, und raten wäre schlechter als weglassen.
    if (jahrAus(fahrt.datum) === null) continue;
    const bisher = nachId.get(fahrt.route_id);
    if (!bisher) {
      nachId.set(fahrt.route_id, { ersteFahrt: fahrt.datum, anzahl: 1 });
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
