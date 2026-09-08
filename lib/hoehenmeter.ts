// Die eine Definition von "Höhenmeter", die im Produkt gilt: die Summe des
// kumulierten Anstiegs (route_completions.hoehenmeter_aufstieg, aus dem
// GPS-Track abgeleitet in lib/elevation.ts → computeAscentM) über die
// gezählten Fahrten.
//
// Vorher rechneten Profilseite, öffentliches Profil und Teilen-Abzeichen
// stattdessen mit routes.hoehe_m — der SCHEITELHÖHE der Strecke. Das ist eine
// andere Grösse (lib/elevation.ts:116-119 sagt das selbst) und summiert sich
// nicht sinnvoll: zehn Fahrten über denselben 2000er ergaben so je nach
// Oberfläche 2000 m (eigenes Profil, pro Strecke dedupliziert) oder 20 000 m
// (öffentliches Profil, pro Fahrt), während die Bestenliste dieselbe Person
// mit dem echten Anstieg führte. Siehe docs/audit/backend.md, Befund M3.
//
// Fahrten ohne Messwert zählen als 0. hoehenmeter_aufstieg ist null, wenn der
// swisstopo-Höhendienst nichts geliefert hat (Koordinaten ausserhalb der
// Schweiz oder Ausfall — lib/actions/completions.ts → deriveElevation fängt
// das bewusst ab) und bei Altfahrten vor 0044_freie_fahrten.sql. Das
// entspricht genau der Bestenliste: sum() in
// 0056_freie_fahrten_in_bestenlisten.sql überspringt NULL-Werte ebenso.
//
// Ausdrücklich KEIN Rückfall auf routes.hoehe_m für solche Fahrten — damit
// wären zwei Fahrten derselben Liste wieder unterschiedlich definiert, und
// genau das ist der Fehler, den diese Funktion behebt.
export interface FahrtMitAnstieg {
  hoehenmeter_aufstieg: number | null;
}

export function summiereHoehenmeter(fahrten: readonly FahrtMitAnstieg[]): number {
  // Gerundet, weil die Spalte numeric ist: computeAscentM liefert zwar ganze
  // Meter, aber eine direkt per PostgREST geschriebene Zeile muss das nicht
  // (0059/0074 begrenzen den Wert, erzwingen aber keine Ganzzahl), und eine
  // Kachel mit "12 043.7 m" wäre ein Anzeigefehler.
  return Math.round(
    fahrten.reduce((summe, fahrt) => summe + (fahrt.hoehenmeter_aufstieg ?? 0), 0),
  );
}
