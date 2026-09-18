import type { FahrzeugTyp, Motorklasse } from "@/types/database";

// Die Motorklassen als eine Quelle für Katalog, Ableitung und Anzeige.
//
// Der zweite Ort derselben Wahrheit ist public.motorklasse() in
// supabase/migrations/0080_motorklassen.sql. Beide müssen übereinstimmen:
// die Datenbank füllt route_completions.motorklasse beim Schreiben, dieser
// Code zeigt schon beim Eintippen an, in welcher Klasse man landen wird.
// Die Grenzwerte stehen deshalb an beiden Stellen ausgeschrieben statt
// abgeleitet, und motorklassen.test.ts prüft genau sie.
//
// Warum Führerausweiskategorien für Motorräder und Leistungsbänder für
// Autos: A1/A-35-kW/A kennt jeder Fahrer auswendig, für Autos gibt es keine
// vergleichbare gesetzliche Einteilung.
//
// EINHEITEN — die eine Stelle, an der man sie nachliest:
//
//   gespeichert  immer kW (vehicles.leistung_kw, so steht es im
//                Fahrzeugausweis). Die Bandgrenzen rechnen ausschliesslich
//                damit, und public.motorklasse() in der Datenbank ebenso.
//   eingegeben   beim AUTO in PS, beim MOTORRAD in kW. Über die Leistung
//                eines Autos spricht in der Schweiz niemand in kW; die
//                Motorradklassen heissen dagegen wörtlich "A 35 kW", und
//                ein Fahrer, der 35 kW im Ausweis stehen hat, soll nicht
//                über eine Umrechnung raten müssen, auf welcher Seite der
//                Grenze er landet. psInKw() macht die Umrechnung, sie
//                passiert einmal beim Anlegen des Fahrzeugs.
//   angezeigt    beim Auto PS (label), beim Motorrad die Ausweiskategorie.
//                Die kW-Regel steht bei beiden daneben (regel).

export interface Motorklassendefinition {
  id: Motorklasse;
  typ: FahrzeugTyp;
  /** Kurzform für Chips und Abzeichen. */
  label: string;
  /** Die Regel im Klartext, z.B. unter einer Ranglisten-Überschrift. */
  regel: string;
  /**
   * Rang innerhalb des Fahrzeugtyps. Bewusst nicht typübergreifend: ein
   * Motorrad wird nie in eine Autoklasse hochgestuft und umgekehrt.
   */
  rang: 1 | 2 | 3;
}

export const MOTORKLASSEN: readonly Motorklassendefinition[] = [
  { id: "moto_a1", typ: "motorrad", label: "A1", regel: "bis 125 cm³ · bis 11 kW", rang: 1 },
  { id: "moto_a35", typ: "motorrad", label: "A 35 kW", regel: "bis 35 kW", rang: 2 },
  { id: "moto_a", typ: "motorrad", label: "A offen", regel: "über 35 kW", rang: 3 },
  // Die PS-Bänder sind die exakte Übersetzung der kW-Grenzen unter der
  // Eingaberundung von psInKw(), nicht eine gerundete Näherung davon: 150 PS
  // ergeben 110 kW und damit noch das erste Band, 151 PS ergeben 111 kW und
  // damit das zweite; 299 PS ergeben 220 kW, 300 PS ergeben 221 kW.
  //
  // Vorher stand hier "bis 150 PS" / "150–300 PS" / "über 300 PS" — bei
  // einer kW-Eingabe eine harmlose Rundungsunschärfe, bei einer PS-Eingabe
  // eine falsche Auskunft an genau den zwei Werten, die jemand eintippt,
  // weil sie auf dem Chip stehen.
  { id: "auto_bis110", typ: "auto", label: "bis 150 PS", regel: "bis 110 kW", rang: 1 },
  { id: "auto_bis220", typ: "auto", label: "151–299 PS", regel: "über 110 bis 220 kW", rang: 2 },
  { id: "auto_ueber220", typ: "auto", label: "ab 300 PS", regel: "über 220 kW", rang: 3 },
] as const;

const NACH_ID = new Map<string, Motorklassendefinition>(MOTORKLASSEN.map((k) => [k.id, k]));

export function istMotorklasse(wert: unknown): wert is Motorklasse {
  return typeof wert === "string" && NACH_ID.has(wert);
}

export function motorklassendefinition(klasse: Motorklasse): Motorklassendefinition {
  // Über istMotorklasse/den Motorklasse-Typ abgesichert — ein unbekannter
  // Schlüssel kann hier nur ankommen, wenn Katalog und Typ auseinanderlaufen.
  return NACH_ID.get(klasse) as Motorklassendefinition;
}

export function klassenFuerTyp(typ: FahrzeugTyp): Motorklassendefinition[] {
  return MOTORKLASSEN.filter((k) => k.typ === typ);
}

/** Kurzform fürs UI, z.B. "A1". */
export function motorklasseLabel(klasse: Motorklasse): string {
  return motorklassendefinition(klasse).label;
}

/**
 * Leitet die Klasse aus den Fahrzeugangaben ab — dasselbe Ergebnis wie
 * public.motorklasse() in der Datenbank.
 *
 * Ohne Leistungsangabe gibt es keine Klasse: das Fahrzeug zählt dann
 * weiterhin in der Gesamtwertung, aber in keiner Klassenliste.
 *
 * hubraumCcm darf fehlen, auch bei einem Motorrad — ein E-Motorrad hat
 * keinen Hubraum und gehört mit 11 kW sachlich nach A1. Deshalb zählt ein
 * fehlender Hubraum hier als 0 und nicht als "zu gross für A1".
 */
export function motorklasseFor(fahrzeug: {
  typ: FahrzeugTyp;
  hubraum_ccm?: number | null;
  leistung_kw?: number | null;
}): Motorklasse | null {
  const kw = fahrzeug.leistung_kw;
  if (kw === null || kw === undefined || !Number.isFinite(kw) || kw <= 0) return null;

  if (fahrzeug.typ === "motorrad") {
    const ccm = fahrzeug.hubraum_ccm ?? 0;
    if (kw <= 11 && ccm <= 125) return "moto_a1";
    if (kw <= 35) return "moto_a35";
    return "moto_a";
  }

  if (fahrzeug.typ === "auto") {
    if (kw <= 110) return "auto_bis110";
    if (kw <= 220) return "auto_bis220";
    return "auto_ueber220";
  }

  return null;
}

/**
 * Die höhere zweier Klassen — Gegenstück zu public.motorklasse_hoehere().
 *
 * Gewertet wird nie die kleinere: dass jemand schneller war, als seine
 * Klasse hergibt, ist ein physikalischer Widerspruch; dass jemand langsamer
 * war, beweist nichts (Verkehr, Nässe, Vorsicht). Deshalb korrigiert die
 * Belegprüfung ausschliesslich nach oben und kann keine ehrliche Fahrt
 * schlechter stellen.
 *
 * Klassen verschiedener Fahrzeugtypen sind nicht vergleichbar; dann gewinnt
 * die erste (die deklarierte).
 */
export function hoehereKlasse(
  a: Motorklasse | null,
  b: Motorklasse | null,
): Motorklasse | null {
  if (a === null) return b;
  if (b === null) return a;
  const defA = motorklassendefinition(a);
  const defB = motorklassendefinition(b);
  if (defA.typ !== defB.typ) return a;
  return defB.rang > defA.rang ? b : a;
}

// 1 kW = 1.35962 PS (metrische Pferdestärke).
const PS_PRO_KW = 1.35962;

export function kwInPs(kw: number): number {
  return Math.round(kw * PS_PRO_KW);
}

/**
 * PS-Eingabe in den gespeicherten kW-Wert, auf ganze kW gerundet.
 *
 * Die Rundung ist der Punkt, nicht ein Nebeneffekt: Ein Hersteller, der
 * "110 kW / 150 PS" schreibt, meint 110 kW und 149.6 PS — die 150 ist schon
 * gerundet. Ohne Rundung ergäbe die Rückrechnung 110.33 kW und schöbe genau
 * diesen Wagen über die 110-kW-Grenze in das nächste Band. Mit Rundung
 * kommt aus der aufgerundeten PS-Zahl wieder die kW-Zahl des Fahrzeug-
 * ausweises heraus.
 *
 * Autos tragen im Ausweis ohnehin ganze kW; für Motorräder, wo auch halbe
 * Werte vorkommen, wird gar nicht umgerechnet (dort wird kW eingegeben).
 */
export function psInKw(ps: number): number {
  return Math.round(ps / PS_PRO_KW);
}

export interface Fahrzeugtypdefinition {
  id: FahrzeugTyp;
  /** Mehrzahl, für Chips und Ranglisten-Überschriften: "Autos". */
  label: string;
  /** In welcher Einheit die Leistung dieses Typs eingegeben wird. */
  leistungseinheit: "PS" | "kW";
}

// Die Fahrzeugtypen als Katalog — dieselbe Rolle wie MOTORKLASSEN eine
// Ebene tiefer. Die Werte stammen aus dem CHECK auf vehicles.typ (0001).
//
// Die Reihenfolge ist die Anzeigereihenfolge der oberen Chip-Zeile.
export const FAHRZEUGTYPEN: readonly Fahrzeugtypdefinition[] = [
  { id: "auto", label: "Autos", leistungseinheit: "PS" },
  { id: "motorrad", label: "Motorräder", leistungseinheit: "kW" },
] as const;

const TYP_NACH_ID = new Map<string, Fahrzeugtypdefinition>(
  FAHRZEUGTYPEN.map((t) => [t.id, t]),
);

export function istFahrzeugTyp(wert: unknown): wert is FahrzeugTyp {
  return typeof wert === "string" && TYP_NACH_ID.has(wert);
}

export function fahrzeugtypdefinition(typ: FahrzeugTyp): Fahrzeugtypdefinition {
  return TYP_NACH_ID.get(typ) as Fahrzeugtypdefinition;
}

/**
 * Die zwei Stufen der Bestenlisten-Auswahl in einem Wert: entweder ein
 * ganzer Fahrzeugtyp ("alle Autos") oder eine einzelne Motorklasse
 * ("bis 150 PS").
 *
 * Bewusst EIN Wert und nicht zwei Parameter (typ + klasse): Die Auswahl ist
 * immer genau eines von beidem, und ein Paar liesse den widersprüchlichen
 * Zustand "typ=motorrad, klasse=auto_bis110" überhaupt erst zu — in einem
 * URL-Parameter, den jeder frei setzen kann, wäre das ein Zustand, den
 * jede Abfrage wieder abfangen müsste. Deshalb teilen sich beide Stufen
 * einen Parameter (?klasse=), und istKlassenfilter() ist die eine
 * Allowlist für ihn.
 *
 * Die Schlüssel können sich nicht überschneiden: Fahrzeugtypen heissen
 * "auto"/"motorrad", Motorklassen tragen alle einen Unterstrich.
 */
export type Klassenfilter = FahrzeugTyp | Motorklasse;

export function istKlassenfilter(wert: unknown): wert is Klassenfilter {
  return istFahrzeugTyp(wert) || istMotorklasse(wert);
}

/** Zu welchem Fahrzeugtyp ein Filter gehört — die obere Stufe der Auswahl. */
export function filterTyp(filter: Klassenfilter): FahrzeugTyp {
  return istFahrzeugTyp(filter) ? filter : motorklassendefinition(filter).typ;
}

/** Beschriftung eines Filters, z.B. "Autos" oder "bis 150 PS". */
export function filterLabel(filter: Klassenfilter): string {
  return istFahrzeugTyp(filter)
    ? fahrzeugtypdefinition(filter).label
    : motorklasseLabel(filter);
}

/**
 * Der Filter als Satzglied, zum Einsetzen hinter "Noch keine Fahrt …".
 *
 * filterLabel() ist eine Chip-Beschriftung und passt in keinen Satz: aus
 * "in ${filterLabel}" wurde "in bis 150 PS", "in A offen" und — beim
 * Fahrzeugtyp, dessen Label ein Plural ist — "in Motorräder". Eine Klasse
 * steht deshalb hinter "in der Klasse", ein Fahrzeugtyp als "mit dem …".
 */
export function filterImSatz(filter: Klassenfilter): string {
  if (istFahrzeugTyp(filter)) {
    return filter === "auto" ? "mit dem Auto" : "mit dem Motorrad";
  }
  return `in der Klasse ${motorklasseLabel(filter)}`;
}

/**
 * Die Motorklassen, die ein Filter umfasst: bei einem Fahrzeugtyp dessen
 * drei Klassen, bei einer Klasse genau sie selbst.
 *
 * Das ist die Übersetzung für Abfragen, die nur die Spalte motorklasse
 * kennen (route_leaderboard) — die Typstufe wird dort zu einem IN über
 * drei Werte statt zu einem eigenen Filter.
 */
export function klassenFuerFilter(filter: Klassenfilter): Motorklasse[] {
  return istFahrzeugTyp(filter)
    ? klassenFuerTyp(filter).map((k) => k.id)
    : [filter];
}
