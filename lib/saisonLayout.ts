// Geometrie des Saisonrückblick-Bildes (lib/saisonBild.ts), ohne Canvas —
// damit sie unter Vitest (environment: "node") prüfbar bleibt, wie
// lib/shareLayout.ts für das Teilen-Bild einer Fahrt. Wo gemessen werden
// muss, nimmt eine Funktion hier eine Messfunktion entgegen; drüben ist das
// ctx.measureText, im Test eine Näherung.
//
// Aufbau, von oben nach unten — dieselbe Ordnung in beiden Formaten:
//
//   Wortmarke
//   Meine Saison 2026       (eine Zeile, das Jahr darin gross und in Mono)
//   7 PÄSSE ───────────     (Kopf der Ortsliste)
//   Klausenpass     1'948 m
//   Pragelpass      1'550 m (Zeilen mit Haarlinie, "+N weitere" am Ende)
//   ...
//   Am häufigsten: …        (optional)
//   ▂ ▅ █ ▃                 (Fahrten je Monat)
//   PÄSSE | KM | HÖHENMETER | FAHRTEN
//   ──────────────────────
//   ◯ app.strado.ch
//
// Die Liste bekommt, was oben und unten übrig bleibt. Sie ist das einzige
// Element mit variabler Länge, deshalb misst sich alles andere an festen
// Rändern und die Liste an den anderen.

export type SaisonFormat = "feed" | "story";

export interface FormatMasse {
  breite: number;
  hoehe: number;
  /** Abstand des ersten Elements von der Oberkante. */
  sicherOben: number;
  /** Abstand der Fusszeile von der Unterkante. */
  sicherUnten: number;
}

// Feed 4:5 wie das Fahrten-Bild (lib/shareImage.ts). Story 9:16: Instagram
// und WhatsApp legen oben Profilzeile und Fortschrittsbalken, unten das
// Antwortfeld über das Bild — rund 250 px an beiden Enden. Was dort steht,
// ist verdeckt; die Wortmarke am oberen Rand wäre das Erste, was verschwindet.
export const SAISON_FORMATE: Record<SaisonFormat, FormatMasse> = {
  feed: { breite: 1080, hoehe: 1350, sicherOben: 72, sicherUnten: 72 },
  story: { breite: 1080, hoehe: 1920, sicherOben: 250, sicherUnten: 250 },
};

export const SAISON_RAND = 72;

export interface SaisonLayout {
  breite: number;
  hoehe: number;
  rand: number;
  markeOben: number;
  markeHoehe: number;
  /** Grundlinie von "Meine Saison 2026" — Wort und Jahr stehen darauf. */
  titelBaseline: number;
  listenKopfBaseline: number;
  /** y der Haarlinie unter dem Listenkopf = Oberkante der ersten Zeile. */
  listeOben: number;
  listeUnten: number;
  zeilenHoehe: number;
  maxZeilen: number;
  /** null, wenn es keine "Am häufigsten"-Zeile gibt. */
  meistBaseline: number | null;
  monateOben: number;
  monateBasis: number;
  kennzahlenOben: number;
  fussLinie: number;
  fussBaseline: number;
}

const ZEILEN_HOEHE = 68;

export function saisonLayout(
  format: SaisonFormat,
  { mitMeistgefahren }: { mitMeistgefahren: boolean },
): SaisonLayout {
  const { breite, hoehe, sicherOben, sicherUnten } = SAISON_FORMATE[format];

  // Oben nach unten.
  const markeOben = sicherOben;
  const markeHoehe = 36;
  // Eine Titelzeile statt Marke plus Jahr: eine versale Kleinzeile über
  // einer Überschrift ist die Anmutung einer Überschrift, nicht eine. Das
  // Jahr trägt die Zeile selbst, und die gewonnene Höhe geht an die Liste.
  const titelBaseline = markeOben + markeHoehe + 168;
  const listenKopfBaseline = titelBaseline + 88;
  const listeOben = listenKopfBaseline + 22;

  // Unten nach oben.
  const unten = hoehe - sicherUnten;
  const fussBaseline = unten - 8;
  const fussLinie = fussBaseline - 76;
  // 88 px Kennzahlenblock wie in lib/shareImage.ts (Label + Wert), 56 Luft.
  const kennzahlenOben = fussLinie - 56 - 88;
  // Unter den Balken stehen die Monatsbuchstaben (rund 26 px), dann Luft.
  const monateBasis = kennzahlenOben - 72;
  const monateOben = monateBasis - 64;
  const meistBaseline = mitMeistgefahren ? monateOben - 44 : null;
  const listeUnten = meistBaseline !== null ? meistBaseline - 28 - 32 : monateOben - 48;

  const maxZeilen = Math.max(0, Math.floor((listeUnten - listeOben) / ZEILEN_HOEHE));

  return {
    breite,
    hoehe,
    rand: SAISON_RAND,
    markeOben,
    markeHoehe,
    titelBaseline,
    listenKopfBaseline,
    listeOben,
    listeUnten,
    zeilenHoehe: ZEILEN_HOEHE,
    maxZeilen,
    meistBaseline,
    monateOben,
    monateBasis,
    kennzahlenOben,
    fussLinie,
    fussBaseline,
  };
}

/**
 * Kürzt eine Liste auf höchstens `maxZeilen` Zeilen. Passt sie nicht, wird
 * die letzte Zeile zu "+N weitere" — also eine Ortszeile weniger, damit der
 * Hinweis selbst Platz hat, statt über den Rand zu laufen.
 *
 * Nie "+1 weitere": wenn nur genau ein Eintrag fehlte, ist die Zeile für den
 * Hinweis ebenso gross wie der Eintrag selbst. Das kann hier nicht passieren,
 * weil der Eintrag dann schlicht passt (n ≤ maxZeilen); der Fall n =
 * maxZeilen + 1 ergibt "+2 weitere".
 */
export function listeKuerzen<T>(
  eintraege: readonly T[],
  maxZeilen: number,
): { sichtbar: T[]; weitere: number } {
  if (maxZeilen <= 0) return { sichtbar: [], weitere: eintraege.length };
  if (eintraege.length <= maxZeilen) return { sichtbar: [...eintraege], weitere: 0 };
  const sichtbar = eintraege.slice(0, maxZeilen - 1);
  return { sichtbar, weitere: eintraege.length - sichtbar.length };
}

/**
 * Grösste Schriftgrösse zwischen `min` und `start`, bei der der Text in
 * `maxBreite` passt. Passt er auch bei `min` nicht, bleibt es bei `min` —
 * der Aufrufer kürzt dann mit textKuerzen.
 *
 * @param breiteBei liefert die Textbreite bei einer Schriftgrösse in px.
 */
export function schriftFuerBreite(
  breiteBei: (px: number) => number,
  maxBreite: number,
  start: number,
  min: number,
  schritt = 2,
): number {
  let px = start;
  while (px > min && breiteBei(px) > maxBreite) px = Math.max(min, px - schritt);
  return px;
}

/**
 * Schneidet einen Text mit "…" ab, bis er in `maxBreite` passt. Wortgrenzen
 * werden nicht gesucht: ein Passname hat selten mehr als zwei Wörter, und ein
 * Schnitt nach "Col du" wäre nicht verständlicher als "Col du Pil…".
 */
export function textKuerzen(
  text: string,
  breiteVon: (t: string) => number,
  maxBreite: number,
): string {
  if (breiteVon(text) <= maxBreite) return text;
  // Nach Codepoints, nicht nach UTF-16-Einheiten — sonst zerschneidet ein
  // Schnitt ein Zeichen ausserhalb der BMP in zwei halbe.
  const zeichen = Array.from(text);
  for (let n = zeichen.length - 1; n > 0; n--) {
    const versuch = `${zeichen.slice(0, n).join("").trimEnd()}…`;
    if (breiteVon(versuch) <= maxBreite) return versuch;
  }
  return "…";
}

export interface Balken {
  x: number;
  breite: number;
  /** Höhe in px ab der Basis; 0 für einen Monat ohne Fahrt. */
  hoehe: number;
}

/**
 * Zwölf Balken für die Fahrten je Monat, gleichmässig über `breite` verteilt.
 * Balken höchstens 24 px breit und mittig im Monatsfeld — ein Balken, der das
 * Feld füllt, liest sich als Fläche statt als Mass. Der stärkste Monat füllt
 * die volle Höhe; jeder Monat mit Fahrten bekommt mindestens 8 px, damit eine
 * einzelne Fahrt neben zwanzig nicht unsichtbar wird.
 */
export function monatsBalken(
  proMonat: readonly number[],
  { x, breite, hoehe }: { x: number; breite: number; hoehe: number },
): Balken[] {
  const feld = breite / 12;
  const balkenBreite = Math.min(24, feld * 0.6);
  const spitze = Math.max(0, ...proMonat);
  return Array.from({ length: 12 }, (_, i) => {
    const anzahl = proMonat[i] ?? 0;
    const h = spitze === 0 || anzahl <= 0 ? 0 : Math.max(8, (anzahl / spitze) * hoehe);
    return { x: x + i * feld + (feld - balkenBreite) / 2, breite: balkenBreite, hoehe: h };
  });
}

/** Ganze Zahl in Schweizer Schreibweise, ohne Locale-Abhängigkeit der
 *  Laufzeit: Hochkomma als Tausendertrennung, wie de-CH es vorsieht. */
export function zahlCH(wert: number): string {
  const gerundet = Math.round(wert);
  const vorzeichen = gerundet < 0 ? "-" : "";
  return vorzeichen + String(Math.abs(gerundet)).replace(/\B(?=(\d{3})+(?!\d))/g, "’");
}

export function saisonDateiname(jahr: number, format: SaisonFormat): string {
  return `strado-saison-${jahr}-${format}.jpg`;
}
