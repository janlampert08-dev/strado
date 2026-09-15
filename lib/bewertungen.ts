// KEIN Import aus lib/supabase/** in dieser Datei, und auch sonst nichts
// Serverseitiges.
//
// components/RatingSection.tsx und components/ExploreSidebar.tsx sind Client
// Components und holen sich hier schnittText/anzahlText. Zöge diese Datei
// lib/supabase/server.ts herein (und damit next/headers), käme das ganze
// Modul ins Browser-Bundle und der Build bräche ab — mit einer Meldung über
// den Pages Router, die auf alles zeigt ausser auf die Ursache. Genau diese
// Falle ist im Kopf von lib/premiumLimits.ts beschrieben; dieselbe Teilung
// gilt hier.
//
// Die Abfrage, die den Schnitt tatsächlich lädt, steht deshalb in
// lib/ratings.ts — dort, wo die übrigen Bewertungs-Abfragen schon wohnen.

/**
 * Der Sternenschnitt einer Strecke.
 *
 * `anzahl` zählt ausschliesslich Zeilen MIT Sternen, nicht alle Bewertungen:
 * seit 0025 kann eine Zeile aus einem blossen Kommentar bestehen (siehe
 * 0095), und die in den Nenner zu nehmen hiesse, jeden Kommentar ohne
 * Wertung als schlechte Wertung zu zählen.
 */
export interface Streckenbewertung {
  /** Arithmetisches Mittel, ungerundet — das Runden gehört in die Anzeige. */
  schnitt: number;
  anzahl: number;
}

/**
 * Schnitt und Anzahl aus einer Liste von Sternwerten.
 *
 * Getrennt von der Abfrage, damit sie prüfbar ist (Vitest sieht nur lib/) —
 * und weil hier die eine Entscheidung fällt, die man falsch treffen kann:
 * `null` ist kein Wert, sondern die Abwesenheit eines Werts.
 */
export function bewertungAusSternen(sterne: readonly (number | null)[]): Streckenbewertung | null {
  const werte = sterne.filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  if (werte.length === 0) return null;

  const summe = werte.reduce((a, b) => a + b, 0);
  return { schnitt: summe / werte.length, anzahl: werte.length };
}

/**
 * Anzeigeform des Schnitts: genau eine Nachkommastelle.
 *
 * Eine Stelle, weil zwei eine Genauigkeit vortäuschen, die bei sieben
 * Bewertungen nicht existiert — und weil "4.2" sich liest, während "4.29"
 * gerechnet aussieht.
 *
 * Das Trennzeichen kommt aus de-CH und ist ein PUNKT, kein Komma: die
 * Schweiz schreibt Dezimalzahlen mit Punkt (und Tausender mit Apostroph),
 * anders als Deutschland und Österreich. lib/bewertungen.test.ts hält das
 * fest — der Test ist zuerst mit der deutschen Erwartung geschrieben worden
 * und hat genau deshalb angeschlagen.
 */
export function schnittText(schnitt: number): string {
  return schnitt.toLocaleString("de-CH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** "7 Bewertungen" / "1 Bewertung" — der Singular ist der häufigere Fall. */
export function anzahlText(anzahl: number): string {
  return `${anzahl} ${anzahl === 1 ? "Bewertung" : "Bewertungen"}`;
}
