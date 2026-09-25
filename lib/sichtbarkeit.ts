import { COVERAGE_THRESHOLD_PERCENT } from "@/lib/routeCoverage";

// Die drei Sichtbarkeitsstufen einer Fahrt (0145). In der Datenbank sind es
// zwei Spalten — ist_oeffentlich und fuer_follower —, nie beide true. Hier
// wird daraus eine Stufe, damit Formulare, Umschalter und Server Actions
// nicht jede für sich die Kombinationen auslegen.
//
// Die Reihenfolge ist bedeutsam: jede Stufe zeigt die Fahrt mehr Leuten als
// die davor. Ranglisten lesen nur "oeffentlich".
export const SICHTBARKEITEN = ["privat", "follower", "oeffentlich"] as const;
export type Sichtbarkeit = (typeof SICHTBARKEITEN)[number];

export function sichtbarkeitAus(row: {
  ist_oeffentlich: boolean;
  fuer_follower?: boolean | null;
}): Sichtbarkeit {
  if (row.ist_oeffentlich) return "oeffentlich";
  if (row.fuer_follower) return "follower";
  return "privat";
}

export function sichtbarkeitSpalten(s: Sichtbarkeit): {
  ist_oeffentlich: boolean;
  fuer_follower: boolean;
} {
  return { ist_oeffentlich: s === "oeffentlich", fuer_follower: s === "follower" };
}

export function istSichtbarkeit(wert: unknown): wert is Sichtbarkeit {
  return typeof wert === "string" && (SICHTBARKEITEN as readonly string[]).includes(wert);
}

// Liest die Stufe aus dem Fazit-Formular. Ein Formular von vor 0145 — offen
// im Browser über das Deploy hinweg, oder ein offline zwischengespeicherter
// Versand (RideSummaryForm schickt ihn bei Verbindung erneut) — kennt nur
// ist_oeffentlich; das gilt dann wie bisher.
export function sichtbarkeitAusFormular(formData: FormData): Sichtbarkeit {
  const wert = formData.get("sichtbarkeit");
  if (istSichtbarkeit(wert)) return wert;
  return formData.get("ist_oeffentlich") === "true" ? "oeffentlich" : "privat";
}

// Kurzbezeichnung für Knöpfe und Menüs.
export const SICHTBARKEIT_LABEL: Record<Sichtbarkeit, string> = {
  privat: "Privat",
  follower: "Follower",
  oeffentlich: "Öffentlich",
};

// Warum eine gespeicherte Fahrt nicht geteilt werden kann — weder mit
// Followern noch mit allen —, oder null. Ein Grund von aussen (zu kurze
// freie Fahrt, importiert) geht vor; sonst entscheidet bei Streckenfahrten
// der Deckungsgrad. Dieselbe Regel prüfen setCompletionVisibility und die
// Datenbank (0052/0145) noch einmal — das hier ist nur die Anzeige.
export function teilenSperrGrund(
  coveragePercent: number | null,
  blockedReason: string | null,
): string | null {
  if (blockedReason) return blockedReason;
  if (coveragePercent !== null && coveragePercent < COVERAGE_THRESHOLD_PERCENT) {
    return `Kann nicht geteilt werden — deckt nur ${Math.round(coveragePercent)}% der Strecke ab.`;
  }
  return null;
}
