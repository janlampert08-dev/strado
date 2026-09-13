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
// Warum Führerausweiskategorien für Motorräder und kW-Bänder für Autos:
// A1/A-35-kW/A kennt jeder Fahrer auswendig, für Autos gibt es keine
// vergleichbare gesetzliche Einteilung. Gespeichert wird durchgehend kW
// (so steht es im Fahrzeugausweis), angezeigt wird bei Autos PS, weil in
// Gesprächen niemand in kW rechnet.

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
  { id: "auto_bis110", typ: "auto", label: "bis 150 PS", regel: "bis 110 kW", rang: 1 },
  { id: "auto_bis220", typ: "auto", label: "150–300 PS", regel: "110 bis 220 kW", rang: 2 },
  { id: "auto_ueber220", typ: "auto", label: "über 300 PS", regel: "über 220 kW", rang: 3 },
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

// 1 kW = 1.35962 PS (metrische Pferdestärke). Nur für die Anzeige — die
// Bänder selbst rechnen durchgehend in kW.
const PS_PRO_KW = 1.35962;

export function kwInPs(kw: number): number {
  return Math.round(kw * PS_PRO_KW);
}
