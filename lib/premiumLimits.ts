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
//      MAX_FOTOS_PREMIUM dort zu exportieren, lässt die
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
// Zwischen 2026-09-07 und 0086 galt eine ausgesprochene Ausnahme: eigene
// Strecken anlegen war Premium (INSERT-Policy auf routes, Migration 0077).
// Sie ist zurückgenommen — das Anlegen ist wieder für jedes angemeldete
// Konto offen, und die Leitregel gilt damit wieder ohne Ausnahme. Wer die
// Begründung sucht, findet sie im Kopf von
// 0086_strecken_anlegen_wieder_offen.sql.
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
 * Private Strecken ohne Abo. Zwischen 0077 und 0086 war diese Grenze ohne
 * Abo unerreichbar — das Anlegen selbst war gesperrt, sie lief also nur noch
 * für die Moderation. Seit 0086 ist sie wieder das, wofür sie gedacht war:
 * der einzige Ort, an dem ein Abo bei Strecken etwas ändert.
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

export function maxFotosProFahrt(istPremium: boolean): number {
  return istPremium ? MAX_FOTOS_PREMIUM : MAX_FOTOS_GRATIS;
}

// ---------------------------------------------------------------------------
// Pläne und Zustand
// ---------------------------------------------------------------------------

/**
 * Was gewählt werden kann.
 *
 * "saisonpass" ist seit 0110 dabei und kein Abo: eine Einmalzahlung für
 * SAISONPASS_MONATE, die sich nicht verlängert. Der Typ heisst trotzdem
 * weiter AboPlan — er steht an einem Dutzend Stellen, und ein Umbenennen
 * nebenbei wäre genau der Umbau, den AGENTS.md ausserhalb des Auftrags
 * verbietet. Wo der Unterschied zählt, fragt der Code istAbo().
 */
export type AboPlan = "monat" | "jahr" | "saisonpass";

/** Die beiden Pläne, die sich verlängern. */
export function istAbo(plan: AboPlan): plan is "monat" | "jahr" {
  return plan === "monat" || plan === "jahr";
}

/**
 * Was tatsächlich abgeschlossen wurde. "gruender" benennt nur noch
 * bestehende Abos: der Gründerpreis wurde bis 2026-09-07 verkauft und ist
 * seither nicht mehr wählbar (Bestandsschutz — wer ihn hat, behält ihn,
 * solange das Abo ununterbrochen läuft). Neue Abos landen auf "monat" oder
 * "jahr"; die Kennung bleibt, damit PremiumCard das Abo richtig benennt.
 */
export type AboPlanKennung = "monat" | "jahr" | "gruender" | "saisonpass";

/**
 * Laufzeit eines Saisonpasses. Steht so in den AGB (Ziff. 4) und auf der
 * Kaufseite, und apply_saisonpass bekommt sie als Parameter — eine zweite
 * Zahl in der Datenbank gibt es bewusst nicht.
 *
 * Sechs Monate ab Kauf statt eines festen Fensters (etwa April bis
 * September): ein fester Zeitraum bestraft jeden, der im Juli kauft, mit
 * einer halben Saison zum vollen Preis. Ab Kauf ist für alle gleich viel
 * wert, und wer im April kauft, bekommt damit genau die Saison.
 */
export const SAISONPASS_MONATE = 6;

/**
 * Gratis-Testphase auf dem Jahresabo, einmal pro Konto. Nur das Jahresabo:
 * der Monatsplan ist mit einem Monat Einsatz bereits der Test, und eine
 * Testphase auf dem Pass wäre ein geschenkter halber Monat Saison.
 */
export const TESTPHASE_TAGE = 14;

/**
 * Wie kurz vor Ablauf ein laufender Saisonpass verlängert werden darf. Der
 * neue Pass schliesst an den alten an (apply_saisonpass); die Grenze
 * verhindert nur den versehentlichen Doppelkauf mitten in der Saison.
 */
export const SAISONPASS_VERLAENGERBAR_TAGE_VOR_ABLAUF = 30;

/** Woher der Zugang kommt — die Oberfläche benennt und verwaltet ihn je
 *  nach Quelle anders (Kundenportal nur beim Abo). */
export type PremiumQuelle = "abo" | "saisonpass" | "manuell";

export interface PremiumStatus {
  /** Darf diese Person die Premium-Funktionen nutzen? Die einzige Frage,
   *  die das Gating stellen sollte. */
  aktiv: boolean;
  plan: AboPlanKennung | null;
  /** Was den Zugang gerade trägt. null ohne Premium. Laufen Abo und Pass
   *  gleichzeitig (Abo abgeschlossen, das erst nach dem Pass abbucht), ist
   *  es "saisonpass", solange der Pass gilt. */
  quelle: PremiumQuelle | null;
  /** Gekündigt, aber noch gültig — bis zu diesem Zeitpunkt. null, wenn das
   *  Abo normal weiterläuft. Beim Saisonpass immer das Passende: er
   *  verlängert sich nie. */
  laeuftAbAm: Date | null;
  /** Ende der laufenden Abrechnungsperiode, unabhängig von einer Kündigung. */
  periodeEndetAm: Date | null;
  /** Das Abo steckt in der Gratis-Testphase — bis zu diesem Zeitpunkt. */
  testphaseBis: Date | null;
  /** Zahlung offen, Zugang läuft befristet weiter (AGB Ziff. 8.2). */
  inKulanzfrist: boolean;
  /** Ende der Kulanzfrist, wenn eine läuft. */
  kulanzBis: Date | null;
  /** Für das Abo ist eine Zahlung offen (Stripe-Status past_due/unpaid,
   *  noch in der Frist aus lib/offeneZahlung.ts) — unabhängig davon, ob die
   *  Kulanzfrist noch läuft. Nach ihrem Ende ist aktiv false, und genau
   *  dann braucht es den Weg ins Kundenportal, um das Zahlungsmittel zu
   *  aktualisieren. */
  offeneZahlung: boolean;
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
}

export interface PremiumAngebot {
  plaene: PlanAngebot[];
  /** Bekäme diese Person beim Jahresabo die Gratis-Testphase? Nur eine
   *  Anzeige — entschieden wird beim Anlegen der Session, gegen Stripe. */
  testphaseMoeglich: boolean;
  /** Läuft ein Saisonpass, beginnt ein neu abgeschlossenes Abo erst mit
   *  dessen Ende zu zahlen — und ein neuer Pass schliesst dort an. ISO. */
  saisonpassBis: string | null;
}

/**
 * Was beim Anlegen des Abos TATSÄCHLICH vergeben wurde.
 *
 * Nicht dasselbe wie das `PlanAngebot`, das die Kaufseite gerendert hat:
 * zwischen Rendern und Klick kann sich der Preis bei Stripe geändert haben.
 * Dann muss die Oberfläche den gezeigten Betrag korrigieren, bevor jemand
 * bestätigt — sonst steht auf der Seite die eine Zahl und abgebucht wird
 * eine andere.
 */
export interface VergebenerPreis {
  /** Was HEUTE abgebucht wird. 0 während einer Testphase oder wenn das Abo
   *  an einen laufenden Pass anschliesst. */
  betragRappen: number;
  waehrung: string;
  /** Gesetzt, wenn die erste Zahlung später fällig wird: ab wann (ISO) und
   *  wie viel dann. Die Schaltfläche muss beides nennen — "CHF 0.00" allein
   *  wäre die halbe Wahrheit über eine Zahlungspflicht. */
  spaeter?: { abRappen: number; faelligAm: string; grund: "testphase" | "anschluss" };
}
