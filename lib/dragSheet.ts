// Reine Rechen- und Entscheidungslogik des Bottom-Sheets
// (components/ui/DragSheet.tsx). Bewusst von der Komponente getrennt: Vitest
// läuft hier unter environment: "node", Komponenten sind also nicht testbar —
// diese Funktionen schon, und die Gestenentscheidung ist der Teil, bei dem ein
// Vorzeichenfehler die halbe Seite unbedienbar macht.

/** Unter dieser Bewegung gilt eine Berührung als Tap, nicht als Ziehen. */
export const DRAG_TAP_THRESHOLD_PX = 6;

/**
 * Ab dieser Bewegung entscheidet eine Wischgeste im Sheet-Inhalt, ob sie das
 * Sheet zieht oder den Inhalt scrollt. Bewusst kleiner als der Touch-Slop der
 * Browser (~8px): Bis dahin ist das touchmove-Event noch `cancelable`, danach
 * hat der Browser das Scrollen womöglich schon übernommen und ein
 * preventDefault() käme zu spät.
 */
export const DRAG_DECISION_THRESHOLD_PX = 4;

/** "sheet" = die Geste zieht das Sheet, "scroll" = der Browser scrollt den Inhalt. */
export type SheetGesture = "sheet" | "scroll";

/** Hält eine Ziehhöhe zwischen Peek- und Vollhöhe (Vollhöhe nie unter Peek). */
export function clampSheetHeight(height: number, peekPx: number, maxHeight: number): number {
  return Math.min(Math.max(height, peekPx), Math.max(peekPx, maxHeight));
}

/** Nach dem Loslassen rastet das Sheet zur näheren der beiden Höhen ein. */
export function isExpandedAfterDrag(height: number, peekPx: number, maxHeight: number): boolean {
  return height > (peekPx + Math.max(peekPx, maxHeight)) / 2;
}

/**
 * Entscheidet einmal pro Wischgeste, wem sie gehört. `deltaY` ist positiv,
 * wenn der Finger nach oben wandert (startY - aktuelles Y), `deltaX` nach
 * derselben Konvention positiv nach links; ausgewertet wird davon nur der
 * Betrag. `scrollTop` ist die Position des gescrollten Elements unter dem
 * Finger.
 *
 * Die Regel ist die gewohnte Bottom-Sheet-Mechanik: eingeklappt zieht ein
 * Wisch nach oben das Sheet auf, statt die paar sichtbaren Zeilen zu scrollen;
 * aufgeklappt scrollt derselbe Wisch den Inhalt. Nach unten gilt es
 * umgekehrt — erst zurück an den Anfang des Inhalts, und erst dort klappt das
 * Sheet wieder ein.
 */
export function decideSheetGesture({
  deltaY,
  deltaX,
  expanded,
  scrollTop,
}: {
  deltaY: number;
  deltaX: number;
  expanded: boolean;
  scrollTop: number;
}): SheetGesture {
  // Waagrechte Absicht (Karussell, Textauswahl) fasst das Sheet nicht an.
  if (Math.abs(deltaX) > Math.abs(deltaY)) return "scroll";

  if (deltaY > 0) return expanded ? "scroll" : "sheet";

  if (scrollTop > 0) return "scroll";
  return expanded ? "sheet" : "scroll";
}
