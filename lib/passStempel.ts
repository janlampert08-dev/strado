// Wann die Liste unter /paesse eine Stempelspalte trägt (components/PaesseListe.tsx).
// Rein und ohne Import, weil die Liste eine Client-Komponente ist.
//
// Gestempelt wird nur, was befahren ist — ein Kreis "noch nicht befahren"
// auf jeder Zeile war auf einem frischen Konto 34 Mal dieselbe Leermeldung.
// Die Spalte selbst gibt es nur mit Sammlung: angemeldet und mindestens ein
// Pass befahren. Dann halten die übrigen Zeilen einen leeren Platz, damit
// die Namen fluchten. Gerechnet über ALLE Einträge, nicht über die
// gefilterten, sonst spränge die Einrückung beim Filtern.
export function hatStempelSpalte(
  angemeldet: boolean,
  eintraege: readonly { gefahren: unknown }[],
): boolean {
  return angemeldet && eintraege.some((e) => e.gefahren !== null && e.gefahren !== undefined);
}
