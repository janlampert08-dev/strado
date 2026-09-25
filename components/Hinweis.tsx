"use client";

import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { usePathname } from "next/navigation";

/**
 * Kurze Quittungen nach einer Handlung ("Fahrt verworfen.", "Nicht mehr
 * gefolgt." mit Rückgängig).
 *
 * WARUM ES DAS BRAUCHT: Mehrere Handlungen der App endeten ohne jede
 * Rückmeldung. Wer eine Fahrt verwarf, landete kommentarlos auf der
 * Startseite; wer entfolgte, sah nur den Knopf umspringen, ohne Weg zurück
 * ausser erneut zu folgen. Eine Rückfrage vorher wäre für eine umkehrbare
 * Handlung zu viel — eine Quittung nachher mit Rückgängig ist das richtige
 * Mass.
 *
 * Zwei Wege hinein, weil zwei Lagen vorkommen:
 * - zeigeHinweis(): auf derselben Seite, sofort (CustomEvent).
 * - merkeHinweis(): vor einer Navigation. Der Text überlebt den
 *   Seitenwechsel im sessionStorage und erscheint auf der Zielseite. Eine
 *   Rückgängig-Handlung kann das nicht mitnehmen — eine Funktion lässt sich
 *   nicht speichern —, deshalb gibt es sie dort nicht.
 */

const EREIGNIS = "strado:hinweis";
const SPEICHER = "strado:hinweis";
const DAUER_MS = 4500;

interface HinweisDaten {
  text: string;
  aktion?: { label: string; ausfuehren: () => void };
}

export function zeigeHinweis(text: string, aktion?: HinweisDaten["aktion"]): void {
  window.dispatchEvent(new CustomEvent<HinweisDaten>(EREIGNIS, { detail: { text, aktion } }));
}

export function merkeHinweis(text: string): void {
  try {
    sessionStorage.setItem(SPEICHER, text);
  } catch {
    // Kein Speicher — dann eben keine Quittung, die Handlung selbst ist
    // davon nicht betroffen.
  }
}

/** Einmal in app/layout.tsx. */
export default function HinweisLeiste() {
  const pathname = usePathname();
  const [hinweis, setHinweis] = useState<HinweisDaten | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Solange der Zeiger auf der Quittung liegt oder der Fokus in ihr steht,
  // läuft keine Uhr: Wer „Rückgängig“ gerade ansteuert — mit der Maus oder
  // per Tab —, dem darf der Knopf nicht unter der Hand verschwinden
  // (WCAG 2.2.1). Beim Verlassen beginnen die 4,5 s von vorn.
  const gehaltenRef = useRef({ zeiger: false, fokus: false });

  const starteUhr = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const { zeiger, fokus } = gehaltenRef.current;
    if (zeiger || fokus) return;
    timerRef.current = setTimeout(() => setHinweis(null), DAUER_MS);
  }, []);

  const halte = useCallback(
    (art: "zeiger" | "fokus", an: boolean) => {
      gehaltenRef.current[art] = an;
      starteUhr();
    },
    [starteUhr],
  );

  const zeigen = useCallback(
    (daten: HinweisDaten) => {
      setHinweis(daten);
      starteUhr();
    },
    [starteUhr],
  );

  function fokusVerlassen(e: FocusEvent<HTMLDivElement>) {
    // Wandert der Fokus nur innerhalb der Quittung weiter, bleibt sie gehalten.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    halte("fokus", false);
  }

  useEffect(() => {
    function empfangen(event: Event) {
      zeigen((event as CustomEvent<HinweisDaten>).detail);
    }
    window.addEventListener(EREIGNIS, empfangen);
    return () => {
      window.removeEventListener(EREIGNIS, empfangen);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [zeigen]);

  // Ein gemerkter Hinweis gehört zur nächsten Seite, also bei jedem Wechsel
  // nachsehen. In einem Callback statt synchron im Effekt (dasselbe Muster
  // wie in useRideRecorder.ts).
  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        const text = sessionStorage.getItem(SPEICHER);
        if (!text) return;
        sessionStorage.removeItem(SPEICHER);
        zeigen({ text });
      } catch {
        // siehe merkeHinweis
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [pathname, zeigen]);

  return (
    // role="status" steht immer im DOM, auch leer: ein Live-Bereich, der
    // erst mit seinem Inhalt eingehängt wird, wird von Screenreadern oft
    // nicht angesagt.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+0.75rem)] z-[60] flex justify-center px-4"
    >
      {hinweis && (
        <div
          onPointerEnter={() => halte("zeiger", true)}
          onPointerLeave={() => halte("zeiger", false)}
          onFocus={() => halte("fokus", true)}
          onBlur={fokusVerlassen}
          // Kein py an der Pille: Der Aktionsknopf ist 44 px hoch (vorher
          // 36) und füllt sie damit ganz — mit py-1.5 wäre die Pille auf
          // 56 px gewachsen. Der Abstand für mehrzeiligen Text sitzt am Text.
          className="pointer-events-auto flex min-h-11 max-w-md items-center gap-3 rounded-full bg-foreground pr-1.5 pl-4 text-sm text-background shadow-overlay"
        >
          <span className="min-w-0 py-2">{hinweis.text}</span>
          {hinweis.aktion && (
            <button
              type="button"
              onClick={() => {
                hinweis.aktion?.ausfuehren();
                // Die Quittung verschwindet unter Zeiger und Fokus weg, ein
                // pointerleave/focusout kommt dann nicht mehr — sonst bliebe
                // die nächste Quittung für immer stehen.
                gehaltenRef.current = { zeiger: false, fokus: false };
                setHinweis(null);
              }}
              className="min-h-11 shrink-0 rounded-full px-3 font-medium text-accent-subtle transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/50"
            >
              {hinweis.aktion.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
