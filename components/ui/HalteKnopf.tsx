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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ausgeloestRef = useRef(false);
  // Losgelassen, bevor die Zeit um war. Sichtbar statt nur im sr-only-Text:
  // im Re-Review tippte ein kurzer Druck ins Leere — der Knopf setzte sich
  // wortlos zurück, und wer im Fahren kurz hinschaut, liest daraus "die App
  // hängt", nicht "halten". Jetzt steht für einen Moment "Länger halten" im
  // Knopf, und Android gibt einen kurzen Doppelimpuls.
  const [zuKurz, setZuKurz] = useState(false);
  const zuKurzTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const abbrechen = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    frameRef.current = null;
    timerRef.current = null;
    startRef.current = null;
    if (!ausgeloestRef.current) setFortschritt(0);
  }, []);

  const beginnen = useCallback(() => {
    if (startRef.current !== null || ausgeloestRef.current) return;
    const beginn = performance.now();
    startRef.current = beginn;

    // AUSGELÖST WIRD ÜBER EINEN TIMER, NICHT ÜBER DIE ANIMATION. Der erste
    // Stand hing beides an requestAnimationFrame — und rAF läuft nicht, wenn
    // der Browser die Seite als verborgen führt oder Frames drosselt
    // (Energiesparmodus, eingebettete Ansicht). Dann blieb der Knopf beim
    // Halten einfach stehen: auf dem Schirm, auf dem die Fahrt beendet wird,
    // der teuerste Ort für einen stummen Ausfall. Im Test auf der Vorschau
    // war genau das zu sehen. Der Timer entscheidet, rAF malt nur.
    timerRef.current = setTimeout(() => {
      if (startRef.current !== beginn) return;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      timerRef.current = null;
      startRef.current = null;
      ausgeloestRef.current = true;
      setFortschritt(1);
      onBestaetigt();
    }, dauerMs);

    function malen(jetzt: number) {
      if (startRef.current !== beginn) return;
      setFortschritt(Math.min((jetzt - beginn) / dauerMs, 0.999));
      frameRef.current = requestAnimationFrame(malen);
    }
    frameRef.current = requestAnimationFrame(malen);
  }, [dauerMs, onBestaetigt]);

  const loslassen = useCallback(() => {
    const war = startRef.current;
    abbrechen();
    if (war === null || ausgeloestRef.current) return;
    navigator.vibrate?.([20, 60, 20]);
    setZuKurz(true);
    if (zuKurzTimerRef.current) clearTimeout(zuKurzTimerRef.current);
    zuKurzTimerRef.current = setTimeout(() => setZuKurz(false), 2500);
  }, [abbrechen]);

  useEffect(
    () => () => {
      abbrechen();
      if (zuKurzTimerRef.current) clearTimeout(zuKurzTimerRef.current);
    },
    [abbrechen],
  );

  function tasteRunter(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Ohne preventDefault löst Enter sofort einen click aus — und die
    // Leertaste scrollt die Seite.
    event.preventDefault();
    if (!event.repeat) beginnen();
  }

  function tasteHoch(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") loslassen();
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
          // setPointerCapture wirft, wenn der Zeiger schon wieder weg ist
          // (sehr kurzer Tipp) — das darf das Halten nicht verhindern.
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // ohne Capture weiter; onPointerCancel fängt den Rest
          }
          setZuKurz(false);
          beginnen();
        }}
        onPointerUp={loslassen}
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
        <span className="relative">{haelt ? "Weiter halten…" : zuKurz ? "Länger halten" : children}</span>
      </button>
      <span id={hinweisId} className="sr-only">
        Gedrückt halten, um auszulösen.
      </span>
    </>
  );
}
