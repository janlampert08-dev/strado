// Der Inhalt des Saisonrückblicks: was aus einem Fahrjahr aufs Bild kommt.
// Die Zeichnung selbst liegt in lib/saisonBild.ts, die Geometrie in
// lib/saisonLayout.ts — hier nur die Auswahl, rein und prüfbar.
//
// ---------------------------------------------------------------------------
// Warum die Saison das Kalenderjahr ist
// ---------------------------------------------------------------------------
// Die Schweizer Fahrsaison liegt vollständig darin: die Pässe öffnen im Mai
// oder Juni und schliessen im Oktober oder November, und wer im Winter fährt,
// fährt Anfahrten, keine Pässe. Eine eigene Saisongrenze (etwa April bis
// März) hätte keinen Vorteil, aber einen Preis: die Zahlen auf dem Bild
// wichen von der Auswertung "Nach Jahr" direkt darüber ab
// (lib/fahrtstatistik.ts), die dieselben Fahrten nach Kalenderjahr zählt.
// Eine Zahl, die an zwei Stellen verschieden ist, glaubt man an keiner.
//
// Die eine Ausnahme ist der Jahreswechsel: im Januar ist das neue Jahr leer,
// und gerade dann will man die vergangene Saison zeigen. waehleSaisonJahr
// fällt deshalb auf das Vorjahr zurück, solange das laufende noch keine
// Fahrt hat.
//
// Keine Zeiten und kein Tempo, aus denselben Gründen wie in
// lib/fahrtstatistik.ts (A1 Bein 2, AGB Ziff. 11.3).

import { fahrtenProMonat, jahrAus } from "@/lib/fahrtstatistik";

export interface SaisonFahrt {
  /** "YYYY-MM-DD" */
  datum: string;
  distanz_km: number | null;
  hoehenmeter_aufstieg: number | null;
  /** null bei einer freien Fahrt. */
  route_id: string | null;
  /** Name der gefahrenen Strecke, null bei einer freien Fahrt. */
  streckenName: string | null;
}

export interface SaisonOrt {
  name: string;
  /** Scheitelhöhe, nur bei Pässen bekannt. */
  hoehe_m: number | null;
}

export interface Saison {
  jahr: number;
  fahrten: number;
  /** Ganze Kilometer — auf einem Bild ist eine Nachkommastelle Rauschen. */
  km: number;
  hoehenmeter: number;
  /** Anzahl verschiedener Pässe in dieser Saison. */
  paesse: number;
  /**
   * Die Orte, mit denen das Bild beginnt (AGENTS.md: der Ortsname ist die
   * Einheit der Wiedererkennung). Pässe, wenn es welche gab — sonst die
   * gefahrenen Strecken. In der Reihenfolge, in der sie in der Saison
   * dazukamen.
   */
  orte: SaisonOrt[];
  ortArt: "paesse" | "strecken";
  /** Die Strecke, die am häufigsten vorkam — nur ab zwei Fahrten, sonst
   *  wäre "am häufigsten" bei lauter Einzelfahrten eine Zufallswahl. */
  meistgefahren: { name: string; anzahl: number } | null;
  /** Zwölf Zahlen, Fahrten je Monat, Index 0 = Januar. */
  proMonat: number[];
}

/**
 * Welches Jahr der Rückblick zeigt: das laufende, wenn es schon eine Fahrt
 * hat, sonst das Vorjahr, wenn dieses eine hat — sonst keines (null).
 *
 * @param heute "YYYY-MM-DD" in Schweizer Zeit (todayInZurich aus lib/format.ts).
 */
export function waehleSaisonJahr(daten: readonly string[], heute: string): number | null {
  const laufend = jahrAus(heute);
  if (laufend === null) return null;
  const jahre = new Set(daten.map(jahrAus));
  if (jahre.has(laufend)) return laufend;
  if (jahre.has(laufend - 1)) return laufend - 1;
  return null;
}

/**
 * Wertet ein Jahr aus. Liefert auch für ein leeres Jahr ein Objekt mit
 * fahrten = 0 — die Oberfläche entscheidet dann, dass sie erklärt statt ein
 * leeres Bild zu erzeugen (istSaisonLeer).
 */
export function saisonAuswerten(
  fahrten: readonly SaisonFahrt[],
  paesse: readonly { id: string; name: string; hoehe_m: number | null }[],
  jahr: number,
): Saison {
  const imJahr = fahrten
    .filter((f) => jahrAus(f.datum) === jahr)
    // Chronologisch, damit "in der Reihenfolge, in der sie dazukamen" gilt,
    // egal wie die Abfrage sortiert hat (die Profilseite liefert neueste
    // zuerst). Stabil bei gleichem Datum.
    .slice()
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));

  const passNachId = new Map(paesse.map((p) => [p.id, p]));

  let km = 0;
  let hoehenmeter = 0;
  const passReihe = new Map<string, SaisonOrt>();
  const streckenReihe = new Map<string, { name: string; anzahl: number; erste: number }>();

  imJahr.forEach((fahrt, index) => {
    km += fahrt.distanz_km ?? 0;
    hoehenmeter += fahrt.hoehenmeter_aufstieg ?? 0;
    if (fahrt.route_id === null) return;

    const pass = passNachId.get(fahrt.route_id);
    if (pass && !passReihe.has(pass.id)) {
      passReihe.set(pass.id, { name: pass.name, hoehe_m: pass.hoehe_m });
    }

    const name = pass?.name ?? fahrt.streckenName;
    if (!name) return;
    const bisher = streckenReihe.get(fahrt.route_id);
    if (bisher) bisher.anzahl += 1;
    else streckenReihe.set(fahrt.route_id, { name, anzahl: 1, erste: index });
  });

  const strecken = [...streckenReihe.values()];
  const orte: SaisonOrt[] =
    passReihe.size > 0
      ? [...passReihe.values()]
      : strecken.map((s) => ({ name: s.name, hoehe_m: null }));

  // Gleichstand: die früher in der Saison gefahrene gewinnt — reproduzierbar
  // und erzählerisch plausibler als das Alphabet.
  const spitze = strecken.reduce<(typeof strecken)[number] | null>(
    (beste, s) =>
      beste === null || s.anzahl > beste.anzahl || (s.anzahl === beste.anzahl && s.erste < beste.erste)
        ? s
        : beste,
    null,
  );

  return {
    jahr,
    fahrten: imJahr.length,
    km: Math.round(km),
    hoehenmeter: Math.round(hoehenmeter),
    paesse: passReihe.size,
    orte,
    ortArt: passReihe.size > 0 ? "paesse" : "strecken",
    meistgefahren: spitze && spitze.anzahl >= 2 ? { name: spitze.name, anzahl: spitze.anzahl } : null,
    proMonat: fahrtenProMonat(
      imJahr.map((f) => ({ ...f, fahrzeug_id: null })),
      jahr,
    ),
  };
}

export function istSaisonLeer(saison: Saison | null): boolean {
  return saison === null || saison.fahrten === 0;
}
