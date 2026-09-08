"use client";

import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Ab hier löst das Loslassen ein Neuladen aus. 72 px ist weit genug, um nicht
// bei jedem versehentlichen Überziehen am Listenanfang auszulösen, und nah
// genug, um mit dem Daumen in einer Bewegung erreichbar zu sein.
const SCHWELLE_PX = 72;
// Weiter zieht der Indikator nicht mit — ohne Deckel schöbe ein langer Zug
// den ganzen Inhalt aus dem Bild.
const MAX_PX = 96;
// Der Indikator folgt dem Finger nur halb: die Bewegung fühlt sich dadurch
// an, als arbeite man gegen einen Widerstand, statt den Inhalt wegzuschieben.
const DAEMPFUNG = 0.5;
// Höhe, in der die fertig gezeichnete Linie während des Neuladens steht.
const LADE_HOEHE_PX = 28;

// pathLength normalisiert die Pfadlänge auf 100 — so lässt sich der
// Fortschritt als Prozentwert setzen, ohne den Pfad im Browser ausmessen zu
// müssen (getTotalLength() wäre ein Layout-Zugriff pro Bewegungsereignis).
const PFAD_LAENGE = 100;

function bevorzugtReduzierteBewegung() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Ziehen zum Aktualisieren für die scrollenden Inhaltsseiten.
 *
 * Umschliesst den vorhandenen Scroll-Container einer Seite (das
 * `flex-1 overflow-y-auto`-div) und zeichnet über dessen Inhalt einen
 * Indikator, sobald am oberen Ende weitergezogen wird: eine stilisierte
 * Streckenlinie, die sich proportional zur Zugstrecke selbst zeichnet.
 *
 * Bewusst nur touch: mit Maus oder Trackpad gibt es diese Geste nicht, und
 * ein Zeigergerät würde beim Markieren von Text sonst versehentlich ziehen.
 * Ebenso bewusst nicht auf der Startseite und der Streckendetailseite — dort
 * liegt das DragSheet, dessen eigene Zieh-Geste sich sonst mit dieser
 * überlagern würde.
 */
export default function PullToRefreshArea({ children }: { children: ReactNode }) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const zugStartRef = useRef<number | null>(null);
  const [zug, setZug] = useState(0);
  // Bei reduzierter Bewegung wird die Linie nicht gezeichnet, sondern steht
  // ab der Schwelle fertig da — die Funktion (Neuladen) bleibt, nur die
  // Bewegung fällt weg.
  const [statisch, setStatisch] = useState(false);
  const [laedt, startNeuladen] = useTransition();

  // Der Scroll-Container ist das letzte Kind: Indikator zuerst, Inhalt
  // danach. Über die Kinder statt über eine Ref am Aufrufer, damit die
  // Änderung je Seite eine Zeile bleibt.
  function scrollContainer(): HTMLElement | null {
    return (wrapperRef.current?.lastElementChild as HTMLElement | null) ?? null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (laedt) return;
    // Nur am oberen Ende: mitten in der Liste gehört die Bewegung dem Scrollen.
    if ((scrollContainer()?.scrollTop ?? 0) > 0) return;
    zugStartRef.current = event.clientY;
    setStatisch(bevorzugtReduzierteBewegung());
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = zugStartRef.current;
    if (start === null) return;
    const delta = event.clientY - start;
    // Nach oben gezogen heisst: es war doch eine Scroll-Geste.
    if (delta <= 0) {
      setZug(0);
      return;
    }
    // Während des Ziehens kann der Container weiterscrollen (z. B. durch
    // Trägheit) — dann die Geste abbrechen statt gegen das Scrollen zu
    // arbeiten.
    if ((scrollContainer()?.scrollTop ?? 0) > 0) {
      zugStartRef.current = null;
      setZug(0);
      return;
    }
    setZug(Math.min(delta * DAEMPFUNG, MAX_PX));
  }

  function handlePointerUp() {
    const ausgeloest = zugStartRef.current !== null && zug >= SCHWELLE_PX;
    zugStartRef.current = null;
    setZug(0);
    // router.refresh() gibt kein Promise zurück; in einen Übergang gepackt
    // sagt isPending, wie lange die neuen Serverdaten unterwegs sind.
    if (ausgeloest) startNeuladen(() => router.refresh());
  }

  const hoehe = laedt ? LADE_HOEHE_PX : zug;
  const fortschritt = laedt || statisch ? 1 : Math.min(zug / SCHWELLE_PX, 1);
  // Während des Ziehens ohne Übergang, damit der Indikator am Finger klebt;
  // beim Loslassen (zug fällt auf 0) und beim Laden mit, damit er nicht
  // springt.
  const mitUebergang = zug === 0;

  return (
    <div
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Im Ruhezustand h-0 und overflow-hidden: kein reservierter Platz,
          also auch keine Verschiebung des Inhalts, solange nicht gezogen wird. */}
      <div
        role="status"
        aria-live="polite"
        className={`flex shrink-0 items-end justify-center overflow-hidden ${
          mitUebergang ? "transition-[height] duration-base ease-standard" : ""
        }`}
        style={{ height: `${hoehe}px` }}
      >
        <svg viewBox="0 0 64 20" className="h-5 w-16 text-accent" aria-hidden="true">
          <path
            d="M2 16 C 12 16, 13 5, 23 5 S 39 15, 45 10 S 58 3, 62 5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            pathLength={PFAD_LAENGE}
            strokeDasharray={PFAD_LAENGE}
            strokeDashoffset={PFAD_LAENGE * (1 - fortschritt)}
          />
        </svg>
        <span className="sr-only">{laedt ? "Wird aktualisiert…" : ""}</span>
      </div>
      {children}
    </div>
  );
}
