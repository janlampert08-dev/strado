// Grenzwerte, Plan-Kennungen und Datenformen des Premium-Abos — ohne jede
// Abhängigkeit auf Server-Module.
//
// Der Zuschnitt ist kein Selbstzweck, sondern zwei Randbedingungen von
// Next.js gleichzeitig:
//
//   1. lib/premium.ts liest den Abo-Zustand und importiert dafür
//      lib/supabase/server.ts (und damit next/headers). Eine Client
//      Component, die von dort auch nur eine Konstante zöge, brächte das
//      ganze Modul ins Browser-Bundle — und scheiterte.
//   2. lib/actions/billing.ts trägt "use server" und darf laut React/Next
//      ausschliesslich async Functions exportieren. Eine Zahl wie
//      GRUENDER_PLAETZE dort zu exportieren, lässt die
//      Client-Reference-Transformation die Datei als "hat gar keine
//      Exporte" behandeln — der Build bricht mit einer Fehlermeldung ab,
//      die auf den Import und nicht auf die Ursache zeigt. Dieselbe Falle
//      ist in lib/constants.ts für REPORT_REASONS beschrieben.
//
// Alles, was beide Seiten brauchen, steht deshalb hier. Typen wären auch
// direkt möglich (sie werden wegkompiliert), aber sie zusammen mit den
// Werten an einem Ort zu halten macht die Regel merkbar: was Client UND
// Server sehen, steht in dieser Datei.

// ---------------------------------------------------------------------------
// Grenzwerte
// ---------------------------------------------------------------------------
//
// Leitregel aus docs/premium-plan.md, Abschnitt 4: additives Gating. Was ein
// kostenloses Konto heute kann, kann es nach dem Launch weiterhin — Premium
// hebt Obergrenzen an, es nimmt keine weg. Deshalb stehen die
// Gratis-Obergrenzen hier auf genau den Werten, die vorher galten.
//
// Jeder dieser Werte steht so in den veröffentlichten AGB (Ziff. 3.2). Ihn
// zu ändern heisst, eine zugesagte Vertragsleistung zu ändern — Kernregel 16
// verbietet, das nebenbei zu tun.

/** Fotos pro Fahrt ohne Abo. Der Wert, der vor Premium galt. */
export const MAX_FOTOS_GRATIS = 6;
/** Fotos pro Fahrt mit Abo. */
export const MAX_FOTOS_PREMIUM = 12;

/**
 * Offline gespeicherte Strecken ohne Abo. Rein lokal im Browser
 * (IndexedDB) — kostet uns nichts, die Grenze ist ein Anreiz und keine
 * Kostenbremse. Entsprechend wird sie auch nur im Client durchgesetzt;
 * es gibt keine Serverseite, auf der etwas läge.
 */
export const MAX_OFFLINE_STRECKEN_GRATIS = 3;

/**
 * Private Strecken ohne Abo. Die EINZIGE Stelle, an der Premium etwas
 * einschränkt, was heute offen ist — entsprechend vorsichtig:
 *
 * - Eine statt null, damit die Funktion ohne Abo erlebbar bleibt und nicht
 *   bloss als gesperrtes Symbol erscheint.
 * - Bestandsschutz für alle, die zum Stichtag mehr hatten: sie behalten
 *   unbegrenzt viele. Begrenzt ist ausschliesslich das NEUANLEGEN.
 *
 * Die Durchsetzung liegt in darf_private_strecke_anlegen()
 * (0064_private_strecken_bestandsschutz.sql), wo dieselbe Zahl steht — wer
 * die eine ändert, muss die andere mitziehen.
 */
export const MAX_PRIVATE_STRECKEN_GRATIS = 1;

/**
 * Anzahl Gründerpreis-Plätze (AGB Ziff. 4.3). Die Vergabe selbst zählt in
 * der Datenbank (gruenderplatz_beanspruchen, Migration 0065); diese Zahl
 * wird als Obergrenze mitgegeben.
 */
export const GRUENDER_PLAETZE = 100;

export function maxFotosProFahrt(istPremium: boolean): number {
  return istPremium ? MAX_FOTOS_PREMIUM : MAX_FOTOS_GRATIS;
}

// ---------------------------------------------------------------------------
// Pläne und Zustand
// ---------------------------------------------------------------------------

/**
 * Was gewählt werden kann. Der Gründerpreis steht bewusst NICHT darin: er
 * ist keine Wahl, sondern eine Eigenschaft des Jahresplans, die der Server
 * vergibt, solange von den Plätzen noch einer frei ist. Dürfte der Client
 * ihn wählen, wäre er kein Kontingent mehr.
 */
export type AboPlan = "monat" | "jahr";

/** Was tatsächlich abgeschlossen wurde — hier taucht der Gründerpreis auf. */
export type AboPlanKennung = "monat" | "jahr" | "gruender";

export interface PremiumStatus {
  /** Darf diese Person die Premium-Funktionen nutzen? Die einzige Frage,
   *  die das Gating stellen sollte. */
  aktiv: boolean;
  plan: AboPlanKennung | null;
  /** Gekündigt, aber noch gültig — bis zu diesem Zeitpunkt. null, wenn das
   *  Abo normal weiterläuft. */
  laeuftAbAm: Date | null;
  /** Ende der laufenden Abrechnungsperiode, unabhängig von einer Kündigung. */
  periodeEndetAm: Date | null;
  /** Zahlung offen, Zugang läuft befristet weiter (AGB Ziff. 8.2). */
  inKulanzfrist: boolean;
  /** Ende der Kulanzfrist, wenn eine läuft. */
  kulanzBis: Date | null;
}

export interface PrivateStreckenKontingent {
  erlaubt: boolean;
  /** Wie viele private Strecken existieren bereits. */
  vorhanden: number;
  /** null bedeutet unbegrenzt (Premium oder Bestandsschutz). */
  grenze: number | null;
  grund: "premium" | "bestandsschutz" | "kontingent_frei" | "kontingent_erschoepft";
}

// ---------------------------------------------------------------------------
// Angebot auf der Kaufseite
// ---------------------------------------------------------------------------

export interface PlanAngebot {
  plan: AboPlan;
  /** Betrag in Rappen, wie Stripe ihn führt. */
  betragRappen: number;
  waehrung: string;
  /** true, wenn dieser Preis der Gründerpreis ist. */
  istGruenderpreis: boolean;
  /** Beim Gründerpreis: der reguläre Jahrespreis zum Vergleich. */
  regulaerRappen: number | null;
}

export interface PremiumAngebot {
  plaene: PlanAngebot[];
  gruenderPlaetzeFrei: number;
}
