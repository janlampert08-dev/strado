import type { ExploreRoute } from "@/types/database";

// Ob ein neu in der URL stehender ?q=-Wert von aussen kommt — Zurück/Vorwärts,
// ein geteilter Link, ein Klick auf einen internen Link mit Suchtext — und das
// Eingabefeld deshalb überschreiben darf.
//
// Der Gegenfall ist das Echo unseres eigenen debounced router.replace()
// (ExploreView.tsx): dessen Wert kommt eine RSC-Antwort später als ?q= zurück,
// und bis dahin hat die Nutzerin oft schon weitergetippt. Wird das Echo für
// eine fremde Änderung gehalten, setzt es das Feld auf den abgeschickten —
// also älteren — Stand zurück, und der zuletzt getippte Buchstabe verschwindet.
// Genau das war der Fehler: wer nach einer kurzen Pause einen Buchstaben
// anhängte, verlor ihn wieder.
//
// `zuletztGesendet` ist null, solange diese Ansicht noch nichts geschrieben
// hat — dann ist jeder Wert zwangsläufig fremd.
export function istFremderSuchtext(
  urlWert: string,
  zuletztGesendet: string | null,
): boolean {
  return urlWert !== zuletztGesendet;
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
