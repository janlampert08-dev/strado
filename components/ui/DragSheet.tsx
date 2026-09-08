"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { GripHorizontal } from "lucide-react";
import {
  DRAG_DECISION_THRESHOLD_PX,
  DRAG_TAP_THRESHOLD_PX,
  clampSheetHeight,
  decideSheetGesture,
  isExpandedAfterDrag,
  type SheetGesture,
} from "@/lib/dragSheet";

// So lange nach der letzten Ziehbewegung gilt ein Klick als Nachwehe der
// Wischgeste. Der vom Browser nachgereichte Klick kommt unmittelbar nach dem
// touchend, eine echte Bedienung frühestens deutlich später.
const CLICK_SUPPRESSION_MS = 400;

// Gemeinsame Bottom-Sheet-Mechanik (Mobile): zwischen einer Peek- und einer
// (fast) Vollhöhe auf-/zuziehbar. Zwei Wege führen dorthin — der Ziehgriff
// (ziehen oder tippen) und, seit dieser Fassung, die Wischgeste im Inhalt
// selbst: eingeklappt zieht ein Wisch nach oben das Sheet auf, aufgeklappt
// scrollt derselbe Wisch den Inhalt, und ein Wisch nach unten am Anfang des
// Inhalts klappt wieder ein. Vorher liess sich das Sheet nur über den Griff
// öffnen, was in der eingeklappten Ansicht wie eine tote Fläche wirkte.
// Extrahiert aus ExploreView.tsx, damit dieselbe Geste konsistent auf
// mehreren Seiten läuft (Explore-Liste, Routendetail) statt der Algorithmus
// zweimal leicht unterschiedlich existiert. Ab md: display:contents, die
// Positionierung greift dort nicht mehr — der Aufrufer übernimmt ab md die
// gewohnte Liste/Detail-links, Karte-rechts-Aufteilung über eigene Klassen.
export default function DragSheet({
  containerRef,
  peekPx,
  expandedGapPx = 96,
  handleLabels,
  className = "",
  children,
}: {
  containerRef: RefObject<HTMLElement | null>;
  peekPx: number;
  expandedGapPx?: number;
  handleLabels: { expand: string; collapse: string };
  className?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number; height: number; moved: boolean } | null>(
    null,
  );
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

  const sheetHeight = expanded ? `calc(100% - ${expandedGapPx}px)` : `${peekPx}px`;

  const maxHeightPx = useCallback(() => {
    const containerHeight = containerRef.current?.clientHeight ?? window.innerHeight;
    return containerHeight - expandedGapPx;
  }, [containerRef, expandedGapPx]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const currentHeight = expanded ? maxHeightPx() : peekPx;
      dragRef.current = {
        startY: e.clientY,
        startHeight: currentHeight,
        height: currentHeight,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [expanded, maxHeightPx, peekPx],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaY = drag.startY - e.clientY;
      if (Math.abs(deltaY) > DRAG_TAP_THRESHOLD_PX) drag.moved = true;

      const next = clampSheetHeight(drag.startHeight + deltaY, peekPx, maxHeightPx());
      drag.height = next;
      setDragHeight(next);
    },
    [maxHeightPx, peekPx],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);

      if (!drag) return;

      // Reiner Tap (kaum Bewegung) schaltet um, statt am aktuellen Zustand
      // festzuhalten — sonst müsste man aus der Peek-Position immer ziehen.
      if (!drag.moved) {
        setExpanded((current) => !current);
        setDragHeight(null);
        return;
      }

      setExpanded(isExpandedAfterDrag(drag.height, peekPx, maxHeightPx()));
      setDragHeight(null);
    },
    [maxHeightPx, peekPx],
  );

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
      setExpanded(isExpandedAfterDrag(current.height, peekPx, maxHeightPx()));
      setDragHeight(null);
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
      const startHeight = expanded ? maxHeightPx() : peekPx;
      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        startHeight,
        height: startHeight,
        scroller: findScroller(sheet, e.target),
        mode: null,
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
          expanded,
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
      const next = clampSheetHeight(gesture.startHeight + deltaY, peekPx, maxHeightPx());
      gesture.height = next;
      setDragHeight(next);
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
  }, [expanded, maxHeightPx, peekPx]);

  return (
    <div
      ref={sheetRef}
      onClickCapture={(e) => {
        if (Date.now() > suppressClickUntilRef.current) return;
        suppressClickUntilRef.current = 0;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`absolute inset-x-0 bottom-0 z-10 flex h-[var(--sheet-h)] flex-col overflow-hidden rounded-t-lg border-t border-border bg-background shadow-overlay md:contents ${
        dragHeight === null ? "transition-[height] duration-base ease-standard" : ""
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
        aria-label={expanded ? handleLabels.collapse : handleLabels.expand}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded((current) => !current);
        }}
        className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-t-lg py-2 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset md:hidden"
      >
        <GripHorizontal className="h-5 w-5 text-muted" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}
