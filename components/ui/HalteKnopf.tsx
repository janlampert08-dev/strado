"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

/**
 * Eine Schaltfläche, die erst nach GEDRÜCKT HALTEN auslöst.
 *
 * Gebaut für genau eine Handlung: eine laufende Aufzeichnung beenden. Die
 * stand als gewöhnlicher Knopf da — und zwar exakt dort, wo eine Ansicht
 * vorher der Tab "Fahrt starten" der Navigationsleiste lag. Ein doppeltes
 * Antippen startete und beendete damit eine Fahrt; in der Tasche, am
 * Lenker, mit Handschuhen reicht dafür eine Berührung. Eine Rückfrage per
 * Dialog wäre die andere Antwort gewesen, kostet aber genau in dem Moment
 * zwei Blicke, in dem jemand fährt. Halten ist eine Geste, kein Dialog: sie
 * braucht keinen zweiten Blick und passiert nicht aus Versehen.
 *
 * Die Füllung läuft per requestAnimationFrame über ein Inline-Style statt
 * über eine CSS-Transition. Das ist Absicht und keine Umgehung von
 * prefers-reduced-motion (globals.css): der Fortschritt ist hier keine
 * Zierbewegung, sondern die einzige Rückmeldung, wie lange noch zu halten
 * ist — ohne ihn wäre die Geste blind.
 *
 * Tastatur: Enter oder Leertaste gedrückt halten, genauso lang. Screenreader
 * (VoiceOver: doppeltippen und halten, TalkBack: ebenso) reichen das Halten
 * als Zeigerereignis durch; aria-describedby sagt, dass gehalten werden muss.
 */
export default function HalteKnopf({
  children,
  onBestaetigt,
  dauerMs = 1000,
  className,
}: {
  children: string;
  onBestaetigt: () => void;
  dauerMs?: number;
  className?: string;
}) {
  const hinweisId = useId();
  const [fortschritt, setFortschritt] = useState(0);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const ausgeloestRef = useRef(false);

  const abbrechen = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    startRef.current = null;
    if (!ausgeloestRef.current) setFortschritt(0);
  }, []);

  const beginnen = useCallback(() => {
    if (startRef.current !== null || ausgeloestRef.current) return;
    const beginn = performance.now();
    startRef.current = beginn;
    // Eine lokale Schleife statt eines tick-Callbacks, der sich selbst
    // erneut einplant: so hängt sie an genau diesem einen Druck.
    function schritt(jetzt: number) {
      if (startRef.current !== beginn) return;
      const anteil = Math.min((jetzt - beginn) / dauerMs, 1);
      setFortschritt(anteil);
      if (anteil >= 1) {
        ausgeloestRef.current = true;
        frameRef.current = null;
        startRef.current = null;
        onBestaetigt();
        return;
      }
      frameRef.current = requestAnimationFrame(schritt);
    }
    frameRef.current = requestAnimationFrame(schritt);
  }, [dauerMs, onBestaetigt]);

  useEffect(() => abbrechen, [abbrechen]);

  function tasteRunter(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Ohne preventDefault löst Enter sofort einen click aus — und die
    // Leertaste scrollt die Seite.
    event.preventDefault();
    if (!event.repeat) beginnen();
  }

  function tasteHoch(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") abbrechen();
  }

  const haelt = fortschritt > 0 && fortschritt < 1;

  return (
    <>
      <button
        type="button"
        aria-describedby={hinweisId}
        onPointerDown={(event) => {
          // Den Zeiger festhalten, damit ein leichtes Verrutschen des
          // Daumens das Halten nicht abbricht — abgebrochen wird erst beim
          // Loslassen oder wenn der Browser die Geste übernimmt.
          event.currentTarget.setPointerCapture(event.pointerId);
          beginnen();
        }}
        onPointerUp={abbrechen}
        onPointerCancel={abbrechen}
        onKeyDown={tasteRunter}
        onKeyUp={tasteHoch}
        onBlur={abbrechen}
        // Ein langer Druck öffnet auf Touch-Geräten sonst das Kontextmenü
        // bzw. die Textauswahl.
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          buttonVariants({ variant: "accent", size: "lg" }),
          "relative touch-none overflow-hidden select-none [-webkit-touch-callout:none]",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-accent-strong"
          style={{ width: `${fortschritt * 100}%` }}
        />
        <span className="relative">{haelt ? "Weiter halten…" : children}</span>
      </button>
      <span id={hinweisId} className="sr-only">
        Gedrückt halten, um auszulösen.
      </span>
    </>
  );
}
