"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const zeigen = useCallback((daten: HinweisDaten) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHinweis(daten);
    timerRef.current = setTimeout(() => setHinweis(null), DAUER_MS);
  }, []);

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
        <div className="pointer-events-auto flex min-h-11 max-w-md items-center gap-3 rounded-full bg-foreground py-1.5 pr-1.5 pl-4 text-sm text-background shadow-overlay">
          <span className="min-w-0">{hinweis.text}</span>
          {hinweis.aktion && (
            <button
              type="button"
              onClick={() => {
                hinweis.aktion?.ausfuehren();
                setHinweis(null);
              }}
              className="min-h-9 shrink-0 rounded-full px-3 font-medium text-accent-subtle transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/50"
            >
              {hinweis.aktion.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
