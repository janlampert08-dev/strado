// Abgleich zwischen dem redaktionellen Streckentext (routes.charakter_text)
// und den gerechneten Kennzahlen, die auf derselben Seite daneben stehen.
//
// Anlass (2026-09-25): Der Text zum Ächerlipass sagte "steigt bis zu 16
// Prozent", die Kachel darunter "Max. Steigung 12.8 %". Beides kann stimmen
// — die Kachel ist KEIN absolutes Maximum, sondern das 90. Perzentil über
// 150-m-Fenster auf dem geglätteten Profil (computeHoeheUndSteigung in
// lib/elevation.ts), eine Signalisation am Strassenrand zeigt lokal mehr.
// Für den Leser ist es trotzdem ein Widerspruch auf einem Bildschirm, und
// er glaubt dann keiner der beiden Zahlen. Migration 0140 hat die zwei
// Fälle bereinigt; diese Funktion findet künftige, bevor sie live gehen.
//
// Rein und ohne Import: nutzbar in einem Test, einem Skript über alle
// Strecken oder später in der Moderation, ohne Serverabhängigkeit.
//
// Geprüft werden nur Zahlen mit eindeutiger Einheit:
//   - Steigung: "16 Prozent", "16 %", "16%"
//   - Länge:    "20 km", "rund 20 km"
//   - Höhe:     "1077 m", "(1'610 m)", "1610 m ü. M." — nur Werte ab 300,
//               darunter ist es eher eine Distanz ("nach 200 m")
//   - Kehren:   "37 Kehren"
// Freie Formulierungen ("steil", "viele Kehren") prüft niemand automatisch.

export interface StreckenKennzahlen {
  laengeKm: number;
  /** routes.hoehe_m — Scheitelhöhe der Strecke. */
  hoeheM: number | null;
  /** routes.max_steigung_prozent — 90. Perzentil, siehe oben. */
  maxSteigungProzent: number | null;
  kehren: number | null;
}

export type AbgleichArt = "steigung" | "laenge" | "hoehe" | "kehren";

export interface AbgleichBefund {
  art: AbgleichArt;
  /** Die Stelle im Text, wörtlich. */
  textstelle: string;
  imText: number;
  gerechnet: number;
}

// Toleranzen, bewusst grosszügig: gemeldet wird ein Widerspruch, den ein
// Leser sieht, nicht jede Rundung.
//
// Steigung: Die Kachel heisst "Max. Steigung". Eine Textzahl, die mehr als
// einen Prozentpunkt DARÜBER liegt, liest sich als Widerspruch ("bis zu 16"
// neben "max. 12.8"). Eine kleinere Textzahl ist keiner — "Abschnitte mit 8
// Prozent" auf einer Strecke mit 10 % Maximum stimmt.
const STEIGUNG_TOLERANZ_PP = 1;
// Länge: "rund 20 km" für 19.9 km ist richtig. Gemeldet ab 10 % oder 1 km
// Abweichung, je nachdem, was grösser ist.
const LAENGE_TOLERANZ_ANTEIL = 0.1;
const LAENGE_TOLERANZ_MIN_KM = 1;
// Höhe: Der Text nennt oft die amtliche Passhöhe, die Kennzahl ist der
// höchste Punkt des Tracks (Schwägalp: 1278 m Passhöhe, Track 1299 m). Nur
// eine Textzahl, die ÜBER dem höchsten Punkt liegt, ist unmöglich; darunter
// wird erst ab 150 m gemeldet (dann meint der Text vermutlich etwas anderes).
const HOEHE_TOLERANZ_DARUEBER_M = 15;
const HOEHE_TOLERANZ_DARUNTER_M = 150;
const HOEHE_MIN_M = 300;
// Kehren: die Zählung aus der Geometrie (lib/elevation.ts, 80-m-Peilung)
// ist grob. Gemeldet ab 30 % oder 3 Kehren Abweichung.
const KEHREN_TOLERANZ_ANTEIL = 0.3;
const KEHREN_TOLERANZ_MIN = 3;

function zahl(roh: string): number {
  // de-CH: Tausender mit Apostroph (auch typografisch), Dezimal mit Punkt
  // oder Komma.
  return Number(roh.replace(/['’  ]/g, "").replace(",", "."));
}

const ZAHL = String.raw`(\d{1,3}(?:['’]\d{3})+|\d+(?:[.,]\d+)?)`;

export function gleicheStreckentextAb(
  text: string | null | undefined,
  kennzahlen: StreckenKennzahlen,
): AbgleichBefund[] {
  if (!text) return [];
  const befunde: AbgleichBefund[] = [];

  if (kennzahlen.maxSteigungProzent !== null) {
    for (const m of text.matchAll(new RegExp(String.raw`${ZAHL}\s*(?:%|Prozent)`, "gi"))) {
      const imText = zahl(m[1]);
      if (imText > kennzahlen.maxSteigungProzent + STEIGUNG_TOLERANZ_PP) {
        befunde.push({ art: "steigung", textstelle: m[0], imText, gerechnet: kennzahlen.maxSteigungProzent });
      }
    }
  }

  for (const m of text.matchAll(new RegExp(String.raw`${ZAHL}\s*km\b`, "gi"))) {
    const imText = zahl(m[1]);
    const toleranz = Math.max(LAENGE_TOLERANZ_MIN_KM, kennzahlen.laengeKm * LAENGE_TOLERANZ_ANTEIL);
    if (Math.abs(imText - kennzahlen.laengeKm) > toleranz) {
      befunde.push({ art: "laenge", textstelle: m[0], imText, gerechnet: Number(kennzahlen.laengeKm.toFixed(1)) });
    }
  }

  if (kennzahlen.hoeheM !== null) {
    // "m" als eigenes Wort, nicht der Anfang von "min" oder "km" (dort steht
    // die Zahl vor "km", das \s*m greift also nicht).
    for (const m of text.matchAll(new RegExp(String.raw`${ZAHL}\s*m\b(?!\s*/)`, "g"))) {
      const imText = zahl(m[1]);
      if (imText < HOEHE_MIN_M) continue;
      const differenz = imText - kennzahlen.hoeheM;
      if (differenz > HOEHE_TOLERANZ_DARUEBER_M || -differenz > HOEHE_TOLERANZ_DARUNTER_M) {
        befunde.push({ art: "hoehe", textstelle: m[0], imText, gerechnet: kennzahlen.hoeheM });
      }
    }
  }

  if (kennzahlen.kehren !== null) {
    for (const m of text.matchAll(new RegExp(String.raw`${ZAHL}\s*(?:Kehren|Haarnadelkurven|Serpentinen)`, "gi"))) {
      const imText = zahl(m[1]);
      const toleranz = Math.max(KEHREN_TOLERANZ_MIN, kennzahlen.kehren * KEHREN_TOLERANZ_ANTEIL);
      if (Math.abs(imText - kennzahlen.kehren) > toleranz) {
        befunde.push({ art: "kehren", textstelle: m[0], imText, gerechnet: kennzahlen.kehren });
      }
    }
  }

  return befunde;
}
