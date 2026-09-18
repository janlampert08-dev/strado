import type { ExploreRoute } from "@/types/database";

// Ordnet einen neu in der URL stehenden ?q=-Wert einer der eigenen, noch
// nicht zurückgekommenen Sendungen zu.
//
// Der Gegenfall ist eine fremde Änderung — Zurück/Vorwärts, ein geteilter
// Link, ein interner Link mit Suchtext — und nur die darf das Eingabefeld
// überschreiben. Das eigene Echo darf es nicht: der Wert kommt eine
// RSC-Antwort später als ?q= zurück, und bis dahin hat die Nutzerin oft
// schon weitergetippt. Wird das Echo für fremd gehalten, fällt das Feld auf
// den abgeschickten — also älteren — Stand zurück und der zuletzt getippte
// Buchstabe verschwindet.
//
// WARUM EINE LISTE UND KEIN EINZELNER WERT: Vorher stand hier ein Vergleich
// gegen den zuletzt gesendeten Wert. Der deckt nur den Fall ab, dass höchstens
// eine Sendung unterwegs ist. Braucht eine RSC-Antwort länger als die
// Tipppause (300 ms, SEARCH_URL_SYNC_DEBOUNCE_MS in ExploreView), ist beim
// Eintreffen des Echos für "a" längst "ab" gesendet — der Vergleich meldet
// fremd, und der Buchstabe geht doch verloren. Genau dafür gibt es
// lib/search.test.ts ("zwei Sendungen unterwegs").
//
// Rückgabe: die verbleibenden offenen Sendungen, wenn der Wert das Echo einer
// eigenen ist — sonst null, dann ist die Änderung fremd. Entfernt wird nur der
// getroffene Eintrag, nicht alles davor: Echos können sich überholen, und ein
// vorschnell geleerter Eintrag wäre wieder der Fehler von oben. Die Liste
// bleibt kurz, weil jede Sendung die URL nachweislich ändert (der Effekt
// schreibt nur bei brauchtUrlSync) und damit genau ein Echo erzeugt.
export function echoEinordnen(
  urlWert: string,
  offeneSendungen: readonly string[],
): string[] | null {
  const i = offeneSendungen.indexOf(urlWert);
  if (i === -1) return null;
  return [...offeneSendungen.slice(0, i), ...offeneSendungen.slice(i + 1)];
}

// Ob die URL dem Eingabefeld hinterherhinkt und nachgezogen werden muss.
//
// Verglichen wird getrimmt, weil searchQueryHref() beim Schreiben trimmt: ohne
// das gilt "furka " gegenüber einem ?q=furka dauerhaft als ungleich, und der
// debounced Effekt schriebe im Sekundentakt denselben Wert erneut in die URL.
export function brauchtUrlSync(eingabe: string, urlWert: string): boolean {
  return eingabe.trim() !== urlWert;
}

// Kleinschreibung ohne diakritische Zeichen: "zurich" findet "Zürich",
// "neuchatel" findet "Neuchâtel". Wer ohne Umlaut-Tastatur oder auf
// Französisch und Italienisch sucht, bekam sonst keinen Treffer und die
// Meldung, die Strecke gebe es nicht.
function falten(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Einfache Substring-Suche über Name/Region/Start/Ziel — bewusst ohne
// Fuzzy-Matching, damit das Verhalten für Nutzer vorhersehbar bleibt.
export function matchesSearch(route: ExploreRoute, query: string): boolean {
  const q = falten(query.trim());
  if (!q) return true;
  return (
    falten(route.name).includes(q) ||
    falten(route.region).includes(q) ||
    falten(route.start_ort).includes(q) ||
    falten(route.ziel_ort).includes(q)
  );
}
