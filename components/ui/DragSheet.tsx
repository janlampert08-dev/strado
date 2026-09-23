"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  DRAG_DECISION_THRESHOLD_PX,
  DRAG_TAP_THRESHOLD_PX,
  clampSheetHeight,
  decideSheetGesture,
  gummibandHoehe,
  nextSnapOnTap,
  sheetHeightFor,
  snapAfterFling,
  snapStep,
  wischGeschwindigkeit,
  type SheetGesture,
  type SheetHeights,
  type SheetSnap,
} from "@/lib/dragSheet";

// So lange nach der letzten Ziehbewegung gilt ein Klick als Nachwehe der
// Wischgeste. Der vom Browser nachgereichte Klick kommt unmittelbar nach dem
// touchend, eine echte Bedienung frühestens deutlich später.
const CLICK_SUPPRESSION_MS = 400;

// Notnagel für die Griffhöhe, bis der ResizeObserver unten den echten Wert
// gemessen hat (und dauerhaft ab md, wo der Griff ausgeblendet ist und
// deshalb 0 misst). Entspricht py-5 + h-1 am Griff-Element.
const HANDLE_FALLBACK_PX = 44;

// Höhe der Kompaktzeile (siehe Prop `kompakt`), fest statt gemessen: sie ist
// eine Zeile mit fester Höhe (h-14), und eine Messung verlangte, sie auch
// ausserhalb des eingeklappten Zustands im Layout zu halten.
const KOMPAKT_PX = 56;

// Gemeinsame Bottom-Sheet-Mechanik (Mobile): zwischen drei Rastpunkten
// auf-/zuziehbar — versteckt (nur der Ziehgriff steht über der Karte), Peek
// und die volle Höhe des Containers. Aufgezogen liegt das Sheet damit
// vollständig über der Karte — bis zu einer früheren Fassung blieb oben ein
// Streifen Karte stehen (expandedGapPx, 96px), der den Inhalt auf kleinen
// Geräten um eine Handvoll Zeilen beschnitt, ohne dass der Streifen für die
// Orientierung gereicht hätte.
//
// Der dritte Rastpunkt ("versteckt") kam dazu, weil die Karte auf dem Handy
// vorher nie ganz zu sehen war: das Sheet stand mindestens in Peek-Höhe im
// Bild (auf der Streckendetailseite 320px), und wer die Strecke am unteren
// Bildrand sehen wollte, konnte es nur aufziehen, nicht wegschieben. Ganz
// verschwinden darf es nicht — der Ziehgriff bleibt stehen, sonst gäbe es
// keinen Weg zurück. Im versteckten Zustand ist der Inhalt ausserdem `inert`:
// er ist nur weggeschnitten (overflow-hidden), bliebe also sonst für Tastatur
// und Screenreader erreichbar und würde beim Fokussieren im 36px-Fenster
// herumscrollen.
//
// Nach unten endet das Sheet über der fixierten BottomNav
// (bottom: var(--bottom-nav-h), s. globals.css) statt am Bildschirmrand.
// Vorher lief es bis ganz nach unten und damit unter die Leiste: die ist
// zwar halbtransparent, liegt aber auf z-40 und fing jeden Tipp ab. Auf der
// Startseite landete der Knopf „Strecken in meiner Nähe" in Peek-Höhe genau
// in diesem Streifen — ein Tipp darauf öffnete einen Navigationspunkt statt
// die Standortsuche. Das betraf jeden Inhalt in den untersten ~64px des
// Sheets, nicht nur diesen Knopf. Zwei Wege führen hinauf — der Ziehgriff (ziehen
// oder tippen) und die Wischgeste im Inhalt selbst: unterhalb der Vollhöhe
// zieht ein Wisch nach oben das Sheet weiter auf, aufgeklappt scrollt derselbe
// Wisch den Inhalt, und ein Wisch nach unten am Anfang des Inhalts geht einen
// Rastpunkt tiefer. Vorher liess sich das Sheet nur über den Griff
// öffnen, was in der eingeklappten Ansicht wie eine tote Fläche wirkte.
// Extrahiert aus ExploreView.tsx, damit dieselbe Geste konsistent auf
// mehreren Seiten läuft (Explore-Liste, Routendetail) statt der Algorithmus
// zweimal leicht unterschiedlich existiert. Ab md: display:contents, die
// Positionierung greift dort nicht mehr — der Aufrufer übernimmt ab md die
// gewohnte Liste/Detail-links, Karte-rechts-Aufteilung über eigene Klassen.
export default function DragSheet({
  containerRef,
  peekPx,
  handleLabels,
  onOccludedBottomChange,
  className = "",
  kompakt,
  children,
}: {
  containerRef: RefObject<HTMLElement | null>;
  peekPx: number;
  handleLabels: { expand: string; collapse: string };
  // Meldet, wie viele Pixel am unteren Rand des Containers das Sheet verdeckt
  // (inklusive der BottomNav darunter) — ab md immer 0, da das Sheet dort
  // keine eigene Box mehr hat. Die Karte darunter füllt den ganzen Container;
  // ohne diesen Wert passt sie ihren Ausschnitt auf eine Fläche ein, von der
  // ein gutes Stück unter dem Sheet liegt, und die Strecke steht dann halb
  // verdeckt und zu nah im sichtbaren Rest (siehe RouteMap.tsx, bottomInsetPx).
  //
  // Muss über Renderzyklen stabil sein (eine State-Setter-Funktion etwa) —
  // der Wert steht in den Abhängigkeiten des meldenden Effekts.
  onOccludedBottomChange?: (px: number) => void;
  className?: string;
  /**
   * Was eingeklappt unter dem Griff stehen bleibt — eine Zeile, 56 px.
   * Ohne sie zeigte das eingeklappte Sheet nur den Griff: im Review stand man
   * auf der Streckenseite vor einer Karte ohne jeden Hinweis, welche Strecke
   * das ist. Mit ihr bleibt die volle Kartenansicht erhalten, und der Name
   * steht trotzdem da. Tippen darauf holt das Sheet auf Peek zurück.
   */
  kompakt?: ReactNode;
  children: ReactNode;
}) {
  const inhaltId = useId();
  const [snap, setSnap] = useState<SheetSnap>("peek");
  // Als Boolean für die Abhängigkeitslisten: `kompakt` ist ein ReactNode und
  // bei jedem Render ein neues Objekt — direkt als Abhängigkeit hinge jeder
  // Render die Touch- und Resize-Listener neu an.
  const hatKompakt = kompakt !== undefined && kompakt !== null;
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  // Ob das Sheet überhaupt als Sheet läuft — ab md ist der Wrapper
  // display:contents und der Inhalt ist die normale Seitenleiste.
  const [istSheet, setIstSheet] = useState(true);
  // Gemessen statt konstant: die Griffhöhe ist die Höhe des versteckten
  // Sheets, und eine Zahl, die neben den Griff-Klassen zweitgeschrieben wird,
  // driftet beim ersten Umbau des Griffs auseinander.
  const [handleHeight, setHandleHeight] = useState(HANDLE_FALLBACK_PX);
  // heights wird beim Gestenbeginn EINMAL gemessen und dann mitgeführt —
  // siehe messeHoehen() unten, warum nicht bei jeder Bewegung neu.
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    height: number;
    moved: boolean;
    heights: SheetHeights;
    proben: { t: number; h: number }[];
  } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  // Ein Wisch, der auf einem Link oder Button beginnt und das Sheet zieht,
  // darf beim Loslassen nicht auch noch klicken. Browser unterdrücken den
  // Klick nach einem abgefangenen touchmove meist selbst — "meist" reicht
  // hier nicht, weil der Fehlfall eine ungewollte Navigation wäre.
  //
  // Bewusst ein Zeitfenster und keine Flagge: eine Flagge, die nur ein
  // folgender Klick löscht, bliebe nach einem Wisch, der auf keinem
  // klickbaren Element endet, stehen — und verschluckte dann die nächste
  // Aktivierung per Tastatur, die ohne pointerdown daherkommt.
  const suppressClickUntilRef = useRef(0);

  // Aufgezogen die Höhe der *Inhaltsbox* des Containers, nicht 100% seiner
  // Polsterbox: Prozenthöhen beziehen sich auf letztere, das Sheet wäre also
  // um die abgezogene BottomNav-Höhe zu hoch und schöbe seinen Kopf unter die
  // Kopfleiste (unten steht es mit bottom: var(--bottom-nav-h) auf der
  // Inhaltskante auf). Derselbe Wert, den messeHoehen() unten für die
  // Ziehmathematik rechnet — sonst driften CSS und Geste auseinander.
  const sheetHeight =
    snap === "voll"
      ? "calc(100% - var(--bottom-nav-h))"
      : snap === "peek"
        ? `${peekPx}px`
        : `${handleHeight + (hatKompakt ? KOMPAKT_PX : 0)}px`;

  // MISST, und das kostet: getComputedStyle und clientHeight erzwingen beide
  // ein sofortiges Neuberechnen von Stil und Layout. Beim Ziehen setzt jede
  // Bewegung eine neue Höhe, macht das Layout also gerade schmutzig — hier
  // dann zu messen ist genau das Muster, das eine Geste ruckeln lässt
  // (Layout-Thrashing: schreiben, lesen, schreiben, lesen).
  //
  // Deshalb: einmal beim Gestenbeginn aufrufen, den Wert in der Geste
  // mitführen. Der Container ist das <main> und behält seine Höhe für die
  // Dauer eines Fingerzugs; nur eine Drehung des Geräts mitten in der Geste
  // änderte sie, und die bricht den Zeiger ohnehin ab.
  const messeHoehen = useCallback((): SheetHeights => {
    const el = containerRef.current;
    const minPx = handleHeight + (hatKompakt ? KOMPAKT_PX : 0);
    if (!el) return { minPx, peekPx, maxPx: window.innerHeight };
    // Das Sheet endet am unteren Rand der *Inhaltsbox* des Containers, nicht
    // an dessen Polsterkante (bottom: var(--bottom-nav-h) unten) — die
    // Vollhöhe ist deshalb die Inhaltshöhe. Mit clientHeight (Inhalt plus
    // Polsterung) wüchse das aufgezogene Sheet um genau die Höhe der
    // BottomNav über den Container hinaus und schöbe seinen Kopf unter die
    // Kopfleiste.
    const stil = getComputedStyle(el);
    const polsterung =
      (parseFloat(stil.paddingTop) || 0) + (parseFloat(stil.paddingBottom) || 0);
    return { minPx, peekPx, maxPx: el.clientHeight - polsterung };
  }, [containerRef, handleHeight, peekPx, hatKompakt]);

  // Die echte Griffhöhe. Ab md ist der Griff md:hidden und misst 0 — dann
  // bleibt der Notnagel stehen, damit die Geste nach einer Rückkehr unter md
  // nicht mit einer Höhe von 0 rechnet.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const beobachter = new ResizeObserver(() => {
      const hoehe = handle.offsetHeight;
      if (hoehe > 0) setHandleHeight(hoehe);
    });
    beobachter.observe(handle);
    return () => beobachter.disconnect();
  }, []);

  // Meldet die verdeckte Fläche an den Aufrufer (siehe Prop oben) und hält
  // nebenbei fest, ob das Sheet überhaupt eines ist. Bewusst am Rastpunkt
  // gerechnet statt am laufenden Element gemessen: während der
  // Höhen-Transition stünde dort noch die alte Höhe, und während des Ziehens
  // würde jede Bewegung die Karte neu einpassen.
  useEffect(() => {
    function melde() {
      const el = containerRef.current;
      const sheet = sheetRef.current;
      if (!el || !sheet) return;
      const alsSheet = getComputedStyle(sheet).display !== "contents";
      setIstSheet(alsSheet);
      if (!onOccludedBottomChange) return;
      if (!alsSheet) {
        onOccludedBottomChange(0);
        return;
      }
      const polsterUnten = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      onOccludedBottomChange(sheetHeightFor(snap, messeHoehen()) + polsterUnten);
    }
    melde();
    window.addEventListener("resize", melde);
    return () => window.removeEventListener("resize", melde);
  }, [containerRef, snap, messeHoehen, onOccludedBottomChange]);

  // Die Höhe, auf der das Sheet GERADE steht — nicht die des Rastpunkts.
  // Greift man es mitten im Einrasten, soll es unter dem Finger bleiben,
  // statt erst auf den Zielwert zu springen. offsetHeight liefert während
  // der CSS-Transition den laufenden Wert.
  const aktuelleHoehe = useCallback(
    (heights: SheetHeights) => sheetRef.current?.offsetHeight || sheetHeightFor(snap, heights),
    [snap],
  );

  // Rastet nach einer Geste ein — mit Schwung und einem kurzen Tick, wenn
  // sich der Rastpunkt ändert (nur Android vibriert; iOS kennt die API nicht).
  const einrasten = useCallback(
    (hoehe: number, proben: { t: number; h: number }[], heights: SheetHeights) => {
      const ziel = snapAfterFling(hoehe, wischGeschwindigkeit(proben), heights);
      setSnap((vorher) => {
        if (vorher !== ziel) navigator.vibrate?.(8);
        return ziel;
      });
      setDragHeight(null);
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const heights = messeHoehen();
      const currentHeight = aktuelleHoehe(heights);
      dragRef.current = {
        startY: e.clientY,
        startHeight: currentHeight,
        height: currentHeight,
        moved: false,
        heights,
        proben: [{ t: performance.now(), h: currentHeight }],
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [messeHoehen, aktuelleHoehe],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaY = drag.startY - e.clientY;
    if (Math.abs(deltaY) > DRAG_TAP_THRESHOLD_PX) drag.moved = true;

    const roh = drag.startHeight + deltaY;
    drag.height = clampSheetHeight(roh, drag.heights);
    drag.proben.push({ t: performance.now(), h: roh });
    if (drag.proben.length > 12) drag.proben.shift();
    // Angezeigt wird die gedehnte Höhe, eingerastet wird nach der echten.
    setDragHeight(gummibandHoehe(roh, drag.heights));
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (!drag) return;

    // Reiner Tap (kaum Bewegung) schaltet um, statt am aktuellen Zustand
    // festzuhalten — sonst müsste man aus der Peek-Position immer ziehen.
    if (!drag.moved) {
      setSnap(nextSnapOnTap);
      setDragHeight(null);
      return;
    }

    einrasten(drag.height, drag.proben, drag.heights);
  }, [einrasten]);

  // Die Wischgeste im Inhalt hängt an nativen touch-Listenern statt an den
  // React-Handlern: touchmove muss `passive: false` sein, damit
  // preventDefault() das Scrollen des Inhalts unterbinden kann, sobald die
  // Geste dem Sheet gehört. React registriert seine Listener passiv.
  useEffect(() => {
    if (!sheetRef.current) return;
    // Als eigene, nicht-nullbare Konstante: die Handler unten sind
    // Funktionsdeklarationen, in die TypeScript die Einengung oben nicht
    // hineinträgt.
    const sheet: HTMLDivElement = sheetRef.current;

    let gesture: {
      startX: number;
      startY: number;
      startHeight: number;
      height: number;
      scroller: HTMLElement | null;
      mode: SheetGesture | null;
      heights: SheetHeights;
      proben: { t: number; h: number }[];
    } | null = null;

    // Das gescrollte Element unter dem Finger — dessen scrollTop entscheidet,
    // ob ein Wisch nach unten noch Inhalt zurückzuscrollen hat.
    function findScroller(root: HTMLElement, target: EventTarget | null): HTMLElement | null {
      let node: Element | null = target instanceof Element ? target : null;
      while (node && node !== root && root.contains(node)) {
        if (node instanceof HTMLElement) {
          const overflowY = getComputedStyle(node).overflowY;
          if (
            (overflowY === "auto" || overflowY === "scroll") &&
            node.scrollHeight > node.clientHeight
          ) {
            return node;
          }
        }
        node = node.parentElement;
      }
      return null;
    }

    // Beendet eine laufende Geste: rastet ein, wenn sie das Sheet gezogen
    // hat, und gibt die gezogene Höhe wieder frei. Eine Geste einfach
    // fallen zu lassen ginge nicht — dragHeight bliebe stehen und das Sheet
    // klebte auf der zuletzt gezogenen Höhe fest.
    function settle() {
      const current = gesture;
      gesture = null;
      if (!current || current.mode !== "sheet") return;
      einrasten(current.height, current.proben, current.heights);
    }

    function onTouchStart(e: TouchEvent) {
      // Ein zweiter Finger, der auf dem Sheet aufsetzt, beendet die laufende
      // Geste hier — nicht erst beim Loslassen, wo sie sonst noch einmal
      // einrasten würde.
      settle();
      // Ab md ist der Wrapper display:contents — dort gibt es kein Sheet,
      // also auch keine Geste.
      if (getComputedStyle(sheet).display === "contents") return;
      if (e.touches.length !== 1) return;
      // Der Ziehgriff läuft weiter über die Pointer-Handler oben, inklusive
      // Tap-Umschalter; beides gleichzeitig würde die Höhe doppelt setzen.
      if (handleRef.current?.contains(e.target as Node)) return;

      const touch = e.touches[0];
      const heights = messeHoehen();
      const startHeight = aktuelleHoehe(heights);
      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        startHeight,
        height: startHeight,
        heights,
        scroller: findScroller(sheet, e.target),
        mode: null,
        proben: [{ t: performance.now(), h: startHeight }],
      };
    }

    function onTouchMove(e: TouchEvent) {
      if (!gesture) return;
      // Ein zweiter Finger — auch einer, der ausserhalb des Sheets aufsetzt
      // und hier gar kein touchstart auslöst — macht aus dem Wisch eine
      // andere Geste (Pinch). Sie endet damit sofort, statt beim Loslassen
      // auf der zuletzt gemessenen Höhe einzurasten.
      if (e.touches.length !== 1) {
        settle();
        return;
      }
      const touch = e.touches[0];
      const deltaY = gesture.startY - touch.clientY;
      const deltaX = gesture.startX - touch.clientX;

      if (gesture.mode === null) {
        if (
          Math.abs(deltaY) < DRAG_DECISION_THRESHOLD_PX &&
          Math.abs(deltaX) < DRAG_DECISION_THRESHOLD_PX
        ) {
          return;
        }
        gesture.mode = decideSheetGesture({
          deltaY,
          deltaX,
          snap,
          scrollTop: gesture.scroller?.scrollTop ?? 0,
        });
        // Gehört die Geste dem Inhalt, hält sich das Sheet für den Rest
        // dieser Berührung heraus — auch wenn die Richtung noch dreht.
        if (gesture.mode === "scroll") {
          gesture = null;
          return;
        }
      }

      if (e.cancelable) e.preventDefault();
      // Unterhalb der Tap-Schwelle bleibt die Höhe stehen: eine Berührung mit
      // ein paar Pixeln Wackeln soll das Sheet nicht sichtbar zucken lassen.
      if (Math.abs(deltaY) <= DRAG_TAP_THRESHOLD_PX) return;
      suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESSION_MS;
      const roh = gesture.startHeight + deltaY;
      gesture.height = clampSheetHeight(roh, gesture.heights);
      gesture.proben.push({ t: performance.now(), h: roh });
      if (gesture.proben.length > 12) gesture.proben.shift();
      setDragHeight(gummibandHoehe(roh, gesture.heights));
    }

    function onTouchEnd() {
      settle();
    }

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd);
    sheet.addEventListener("touchcancel", onTouchEnd);
    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
      sheet.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [snap, messeHoehen, aktuelleHoehe, einrasten]);

  // Der Griff beschreibt, was seine Aktivierung tut — und die führt nie nach
  // unten aus dem Blickfeld (siehe nextSnapOnTap): aus "versteckt" und "peek"
  // geht es hinauf, nur aus "voll" wieder zurück auf Peek.
  // DREI RASTPUNKTE, DREI NAMEN. Vorher hiess der Griff in "versteckt" und
  // in "peek" gleich ("Details ausklappen") und meldete beide Male
  // aria-expanded="false" — der Unterschied zwischen einem eingeklappten
  // Sheet und einer halb offenen Vorschau war für Hilfstechnik also gar
  // nicht vorhanden, und der Zustandswechsel per Pfeiltaste blieb stumm.
  // Jetzt benennt jeder Zustand seine eigene Handlung: aus "versteckt"
  // holt der Griff das Sheet zurück, aus "peek" zieht er es ganz auf.
  const handleLabel =
    snap === "voll"
      ? handleLabels.collapse
      : snap === "peek"
        ? `${handleLabels.expand} (ganz)`
        : handleLabels.expand;

  return (
    <div
      ref={sheetRef}
      onClickCapture={(e) => {
        if (Date.now() > suppressClickUntilRef.current) return;
        suppressClickUntilRef.current = 0;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`absolute inset-x-0 bottom-[var(--bottom-nav-h)] z-10 flex h-[var(--sheet-h)] flex-col overflow-hidden rounded-t-lg border-t border-border bg-background shadow-overlay md:contents ${
        // Einrasten mit leichtem Überschwingen (y2 > 1): das Sheet kommt an
        // wie ein Körper, nicht wie ein Aufzug. 320 ms statt 200: mit
        // Schwung legt es jetzt längere Wege zurück.
        dragHeight === null ? "transition-[height] duration-[320ms] ease-[cubic-bezier(0.2,0.9,0.25,1.06)]" : ""
      } ${className}`}
      style={{ "--sheet-h": dragHeight !== null ? `${dragHeight}px` : sheetHeight } as CSSProperties}
    >
      <div
        ref={handleRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        tabIndex={0}
        aria-label={handleLabel}
        aria-expanded={snap === "voll"}
        // Nennt den Bereich, den der Griff auf- und zuzieht — ohne ihn ist
        // "Details ausklappen" eine Handlung ohne Gegenstand.
        aria-controls={inhaltId}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSnap(nextSnapOnTap);
            return;
          }
          // Die Pfeiltasten sind der einzige Weg, das Sheet ohne Wischgeste
          // ganz aus dem Weg zu räumen — ein Tap holt es bewusst nur zurück.
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSnap((current) => snapStep(current, 1));
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSnap((current) => snapStep(current, -1));
          }
        }}
        // py-5 um eine 4-px-Pille: 44 px Griff statt 36. Und die Pille statt
        // des Sechs-Punkte-Symbols: das Punkteraster las sich im Test als
        // "weitere Aktionen", die Pille ist das Zeichen, das iOS und Android
        // für "zieh mich" verwenden.
        className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-t-lg py-5 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset md:hidden"
      >
        <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border-strong" />
      </div>
      {/* display:contents, damit der Wrapper das Layout in keiner Breite
          verändert — weder die Flex-Spalte des Sheets noch, ab md, das
          Hochrutschen des Inhalts als direktes Flex-Kind von <main>. Er
          existiert allein für `inert`: weggeschnittener Inhalt bliebe sonst
          per Tab erreichbar. */}
      {hatKompakt && snap === "versteckt" && dragHeight === null && (
        <button
          type="button"
          onClick={() => setSnap("peek")}
          aria-label={handleLabels.expand}
          className="flex h-14 w-full shrink-0 items-center gap-3 px-5 text-left md:hidden"
        >
          {kompakt}
        </button>
      )}
      <div id={inhaltId} className="contents" inert={istSheet && snap === "versteckt"}>
        {children}
      </div>
    </div>
  );
}
