// Die drei Sichtbarkeitsstufen einer Fahrt (0140). In der Datenbank sind es
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

// Liest die Stufe aus dem Fazit-Formular. Ein Formular von vor 0140 — offen
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
