// Die Bereitschaftszeile vor dem Start einer Aufzeichnung ("GPS ±6 m –
// bereit"). Beantwortet die eine Frage, die man am Passcafé mit dem Helm in
// der Hand hat: kann ich jetzt losfahren, oder misst das Telefon noch
// ungenau?
//
// Rein und ohne Browser-Import, damit die Schwelle einen Test hat und
// FreeRideForm wie LiveTrackingForm dieselbe Zeile zeigen.

/**
 * Bis zu dieser Genauigkeit gilt GPS als "bereit".
 *
 * Bewusst strenger als MIN_ACCURACY_M (50 m) in components/useRideRecorder.ts:
 * dort ist die Grenze, ab der ein Fix überhaupt in den Trail darf. Wer bei
 * 45 m losfährt, dessen erste Punkte zählen zwar, liegen aber noch eine
 * Strassenbreite neben der Strasse — und der Start einer Streckenfahrt hängt
 * an der Nähe zum Startpunkt. 25 m ist der Wert, den ein Telefon unter
 * freiem Himmel nach wenigen Sekunden erreicht; darüber lohnt das Warten.
 */
export const GPS_BEREIT_MAX_M = 25;

/**
 * Drei Stufen statt einer Zahl. Nur die Stufe wird Screenreadern angesagt
 * (role="status"): die Genauigkeit ändert sich mit jedem Fix um ein paar
 * Meter, und eine Ansage pro Meter wäre Lärm, keine Auskunft.
 */
export type GpsStufe = "sucht" | "ungenau" | "bereit";

export function gpsStufe(genauigkeitM: number | null | undefined): GpsStufe {
  // NaN/negativ kommt aus keinem echten Gerät, wird aber wie "kein Fix"
  // behandelt statt als "bereit" — lieber eine Sekunde zu vorsichtig.
  if (genauigkeitM == null || !Number.isFinite(genauigkeitM) || genauigkeitM < 0) {
    return "sucht";
  }
  return genauigkeitM <= GPS_BEREIT_MAX_M ? "bereit" : "ungenau";
}

/** Sichtbarer Text der Zeile, mit der aktuellen Genauigkeit. */
export function gpsBereitschaftsText(genauigkeitM: number | null | undefined): string {
  const stufe = gpsStufe(genauigkeitM);
  if (stufe === "sucht") return "GPS-Signal wird gesucht…";
  // Mindestens ±1 m: ein "±0 m" versprach eine Genauigkeit, die kein
  // Telefon hat.
  const meter = Math.max(1, Math.round(genauigkeitM as number));
  return stufe === "bereit" ? `GPS ±${meter} m – bereit` : `GPS ±${meter} m – wird genauer…`;
}

/**
 * Der Text für die Live-Region: nur die Stufe, ohne Zahl. Er ändert sich
 * damit genau dann, wenn sich die Stufe ändert — und nur dann sagt ein
 * Screenreader etwas an.
 */
export function gpsBereitschaftsAnsage(genauigkeitM: number | null | undefined): string {
  switch (gpsStufe(genauigkeitM)) {
    case "sucht":
      return "GPS-Signal wird gesucht";
    case "ungenau":
      return "GPS wird genauer";
    case "bereit":
      return "GPS bereit";
  }
}
