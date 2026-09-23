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

/**
 * Die Rastpunkte des Sheets, von unten nach oben. "versteckt" ist seit
 * 2026-09-14 dabei: vorher kannte das Sheet nur Peek und Voll, die Karte war
 * auf dem Handy also nie ganz zu sehen — auf der Streckendetailseite standen
 * dauerhaft 320px Info über der Karte, und wer die Kurve am unteren Bildrand
 * sehen wollte, konnte das Sheet nur aufziehen, nicht wegschieben. Ganz
 * verschwinden darf es trotzdem nicht: der Ziehgriff bleibt stehen, sonst
 * gäbe es keinen Weg zurück.
 */
export type SheetSnap = "versteckt" | "peek" | "voll";

/** Rastpunkte von unten nach oben — die Reihenfolge trägt Logik, siehe unten. */
export const SHEET_SNAPS: readonly SheetSnap[] = ["versteckt", "peek", "voll"];

/**
 * Die drei Höhen in Pixeln. `minPx` ist die Höhe des Ziehgriffs (das, was im
 * Zustand "versteckt" stehen bleibt), `maxPx` die Inhaltshöhe des Containers.
 */
export type SheetHeights = { minPx: number; peekPx: number; maxPx: number };

/**
 * Bringt die drei Höhen in eine widerspruchsfreie Ordnung
 * (versteckt <= peek <= voll). Nötig, weil `peekPx` eine feste Zahl der
 * aufrufenden Seite ist und `maxPx` die gemessene Containerhöhe: auf einem
 * kurzen Gerät im Querformat kann der Container kleiner sein als der
 * Peek-Wert, und ohne diese Normalisierung führte das zu einem Rastpunkt
 * über der Vollhöhe.
 */
export function sheetSnapHeights({ minPx, peekPx, maxPx }: SheetHeights): Record<SheetSnap, number> {
  const versteckt = Math.max(0, minPx);
  const peek = Math.max(versteckt, peekPx);
  return { versteckt, peek, voll: Math.max(peek, maxPx) };
}

/** Höhe eines Rastpunkts in Pixeln. */
export function sheetHeightFor(snap: SheetSnap, heights: SheetHeights): number {
  return sheetSnapHeights(heights)[snap];
}

/** Hält eine Ziehhöhe zwischen Griff- und Vollhöhe. */
export function clampSheetHeight(height: number, heights: SheetHeights): number {
  const h = sheetSnapHeights(heights);
  return Math.min(Math.max(height, h.versteckt), h.voll);
}

/**
 * Nach dem Loslassen rastet das Sheet zum nächstgelegenen Rastpunkt ein. Bei
 * exaktem Gleichstand gewinnt der tiefere — dieselbe Regel wie in der
 * Zwei-Zustands-Fassung davor, und die konservativere: auf halbem Weg bleibt
 * mehr Karte sichtbar.
 */
export function snapAfterDrag(height: number, heights: SheetHeights): SheetSnap {
  const h = sheetSnapHeights(heights);
  let best: SheetSnap = "versteckt";
  let bestDistance = Infinity;
  for (const snap of SHEET_SNAPS) {
    const distance = Math.abs(height - h[snap]);
    // Striktes < bei einer von unten nach oben durchlaufenen Liste: der
    // tiefere Rastpunkt bleibt bei Gleichstand stehen.
    if (distance < bestDistance) {
      bestDistance = distance;
      best = snap;
    }
  }
  return best;
}

/**
 * Ein Tap auf den Ziehgriff schaltet zwischen Peek und Voll um; aus dem
 * versteckten Zustand holt er das Sheet auf Peek zurück. Weggeschoben wird
 * ausschliesslich per Wisch — ein Tap, der die Info wegnimmt, wäre der
 * teuerste Fehlgriff der drei.
 */
export function nextSnapOnTap(snap: SheetSnap): SheetSnap {
  return snap === "voll" ? "peek" : snap === "peek" ? "voll" : "peek";
}

/**
 * Einen Rastpunkt nach oben (`1`) oder unten (`-1`) — für die Pfeiltasten auf
 * dem Ziehgriff, die als einziger Weg den versteckten Zustand auch ohne
 * Wischgeste erreichbar machen. An den Enden bleibt es stehen, statt
 * umzuspringen.
 */
export function snapStep(snap: SheetSnap, direction: 1 | -1): SheetSnap {
  const index = SHEET_SNAPS.indexOf(snap);
  return SHEET_SNAPS[Math.min(SHEET_SNAPS.length - 1, Math.max(0, index + direction))];
}

/**
 * Entscheidet einmal pro Wischgeste, wem sie gehört. `deltaY` ist positiv,
 * wenn der Finger nach oben wandert (startY - aktuelles Y), `deltaX` nach
 * derselben Konvention positiv nach links; ausgewertet wird davon nur der
 * Betrag. `scrollTop` ist die Position des gescrollten Elements unter dem
 * Finger.
 *
 * Die Regel ist die gewohnte Bottom-Sheet-Mechanik: solange das Sheet nicht
 * ganz oben steht, zieht ein Wisch nach oben es weiter auf, statt die paar
 * sichtbaren Zeilen zu scrollen; oben angekommen scrollt derselbe Wisch den
 * Inhalt. Nach unten gilt es umgekehrt — erst zurück an den Anfang des
 * Inhalts, und erst dort geht es einen Rastpunkt tiefer.
 */
export function decideSheetGesture({
  deltaY,
  deltaX,
  snap,
  scrollTop,
  waagrechtScrollbar = true,
}: {
  deltaY: number;
  deltaX: number;
  snap: SheetSnap;
  scrollTop: number;
  /**
   * Ob unter dem Finger etwas waagrecht scrollt (Reiter, Karussell). Nur dann
   * darf eine waagrechte Absicht die Geste abgeben. Vorher reichte jede
   * Schräge: entschieden wird nach 4 px, und ein leicht schräg angesetzter
   * Wisch nach oben galt als waagrecht — in der Startliste, wo nichts
   * waagrecht scrollt, passierte dann für die ganze Berührung gar nichts.
   */
  waagrechtScrollbar?: boolean;
}): SheetGesture {
  // Waagrechte Absicht (Karussell, Reiter) fasst das Sheet nicht an.
  if (waagrechtScrollbar && Math.abs(deltaX) > Math.abs(deltaY)) return "scroll";

  if (deltaY > 0) return snap === "voll" ? "scroll" : "sheet";

  // Nach unten: ein noch nicht an den Anfang zurückgescrollter Inhalt behält
  // die Geste — sonst schöbe ein Zurückscrollen in der Peek-Höhe das Sheet
  // weg, statt die Liste an ihren Anfang zu bringen.
  if (scrollTop > 0) return "scroll";
  return "sheet";
}

// ---------------------------------------------------------------------------
// Physik: Schwung, Gummiband, Geschwindigkeit
// ---------------------------------------------------------------------------
// Bis 2026-09-23 rastete das Sheet dort ein, wo der Finger losliess, und
// stoppte an den Enden hart. Ein kurzer, schneller Wisch nach oben blieb
// damit auf Peek liegen, weil der Finger nur 40 px geschafft hatte — auf
// dem Telefon genau die Geste, mit der man ein Sheet aufwirft. Jetzt zählt,
// wohin der Schwung das Sheet getragen hätte.

/**
 * Wie stark ein Wisch nachläuft. Die Projektion ist die Strecke, die ein
 * Körper mit der Anfangsgeschwindigkeit v bei exponentiellem Abbremsen um
 * diesen Faktor je Millisekunde noch zurücklegt: v · r / (1 − r) / 1000.
 * 0.995 liegt zwischen UIScrollView "fast" (0.99) und "normal" (0.998):
 * ein Wisch mit 1000 px/s trägt rund 200 px weiter.
 */
export const SHEET_ABBREMSUNG = 0.995;

/** Wie weit ein Wisch mit `geschwindigkeit` (px/s, positiv = nach oben) noch trägt. */
export function projizierterWeg(geschwindigkeit: number, abbremsung = SHEET_ABBREMSUNG): number {
  return ((geschwindigkeit / 1000) * abbremsung) / (1 - abbremsung);
}

/**
 * Rastpunkt nach einem Wisch: der nächste zur projizierten Höhe, nicht zur
 * Höhe beim Loslassen. Die Projektion wird auf den Bereich der Rastpunkte
 * begrenzt, damit ein sehr schneller Wisch nicht "über" Voll hinaus zählt.
 */
export function snapAfterFling(height: number, geschwindigkeit: number, heights: SheetHeights): SheetSnap {
  const h = sheetSnapHeights(heights);
  const ziel = Math.min(Math.max(height + projizierterWeg(geschwindigkeit), h.versteckt), h.voll);
  return snapAfterDrag(ziel, heights);
}

/**
 * Gummiband an den Enden: statt hart zu stoppen, folgt das Sheet über
 * Voll hinaus und unter den Griff hinab mit wachsendem Widerstand. Die
 * Kurve ist die von iOS: (1 − 1 / (x·c/d + 1)) · d — anfangs fast linear
 * mit Faktor c, nie weiter als d. `d` ist die Containerhöhe als Mass.
 */
export const GUMMIBAND_FAKTOR = 0.55;

export function gummibandHoehe(height: number, heights: SheetHeights): number {
  const h = sheetSnapHeights(heights);
  const d = Math.max(1, h.voll);
  const dehnen = (x: number) => (1 - 1 / ((x * GUMMIBAND_FAKTOR) / d + 1)) * d;
  if (height > h.voll) return h.voll + dehnen(height - h.voll);
  if (height < h.versteckt) return h.versteckt - dehnen(h.versteckt - height);
  return height;
}

/**
 * Geschwindigkeit in px/s aus den letzten Bewegungsproben (Zeit in ms,
 * Höhe in px). Nur die letzten 100 ms zählen: wer zieht, anhält und dann
 * loslässt, hat keinen Schwung mehr — die Geschwindigkeit vom Anfang der
 * Geste wäre dann eine Lüge.
 */
export function wischGeschwindigkeit(proben: readonly { t: number; h: number }[]): number {
  if (proben.length < 2) return 0;
  const letzte = proben[proben.length - 1];
  const fenster = proben.filter((p) => letzte.t - p.t <= 100);
  const erste = fenster[0];
  const dt = letzte.t - erste.t;
  if (dt <= 0) return 0;
  return ((letzte.h - erste.h) / dt) * 1000;
}

// ---------------------------------------------------------------------------
// Feder: das Einrasten nach dem Loslassen
// ---------------------------------------------------------------------------
// Bis 2026-09-23 rastete das Sheet per CSS-Transition ein: immer 320 ms, immer
// dieselbe Kurve mit Überschwingen. Ein langsam abgelegtes Sheet schwang
// damit genauso nach wie ein geworfenes, und ein schneller Wurf verlor beim
// Loslassen schlagartig sein Tempo — die Transition kennt die
// Fingergeschwindigkeit nicht. Die Feder übernimmt sie als Startwert, läuft
// vom aktuellen Wert aus (also auch mitten im Einrasten greifbar) und hat
// keine feste Dauer. Parameter wie bei Apple: Dämpfungsverhältnis
// (1 = kein Überschwingen) und Antwortzeit in Sekunden.

export type Feder = { daempfung: number; antwort: number };

/** Ruhiges Einrasten ohne Überschwingen — Tap, Taste, langsames Ablegen. */
export const FEDER_RUHIG: Feder = { daempfung: 1, antwort: 0.32 };

/** Nach einem Wurf: ein Hauch Überschwingen, weil Schwung vorausging. */
export const FEDER_WURF: Feder = { daempfung: 0.82, antwort: 0.34 };

/** Ab dieser Loslass-Geschwindigkeit (px/s) gilt die Geste als Wurf. */
export const WURF_AB_PX_S = 400;

export function federFuer(geschwindigkeit: number): Feder {
  return Math.abs(geschwindigkeit) >= WURF_AB_PX_S ? FEDER_WURF : FEDER_RUHIG;
}

export type FederZustand = { x: number; v: number };

/**
 * Ein Zeitschritt der Feder (Masse 1). `dt` in Sekunden; intern in
 * Teilschritten von höchstens 4 ms gerechnet, damit ein verspäteter Frame
 * die Feder nicht aufschaukelt.
 */
export function federSchritt(
  zustand: FederZustand,
  ziel: number,
  dt: number,
  { daempfung, antwort }: Feder,
): FederZustand {
  const steifigkeit = ((2 * Math.PI) / antwort) ** 2;
  const reibung = (4 * Math.PI * daempfung) / antwort;
  let { x, v } = zustand;
  const schritte = Math.max(1, Math.ceil(dt / 0.004));
  const h = dt / schritte;
  for (let i = 0; i < schritte; i++) {
    v += (-steifigkeit * (x - ziel) - reibung * v) * h;
    x += v * h;
  }
  return { x, v };
}

/** Ob die Feder zur Ruhe gekommen ist (unter einem halben Pixel, fast still). */
export function federRuht({ x, v }: FederZustand, ziel: number): boolean {
  return Math.abs(x - ziel) < 0.5 && Math.abs(v) < 10;
}
