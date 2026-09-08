"use client";

import { useState, useTransition } from "react";
import { Flame } from "lucide-react";
import { toggleKudos } from "@/lib/actions/kudos";
import { cn } from "@/lib/utils/cn";

// Gleiches optimistisches Toggle-Muster wie FavoriteButton.tsx, zusätzlich
// mit lokal mitgeführtem Zähler (±1 bei Klick, kein Re-Fetch nötig).
export default function KudosButton({
  completionId,
  initialCount,
  initialGiven,
}: {
  completionId: string;
  initialCount: number;
  initialGiven: boolean;
}) {
  const [given, setGiven] = useState(initialGiven);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();
  // Kurzes Aufploppen der Flamme beim Geben — nur beim Geben, nicht beim
  // Zurücknehmen: quittiert wird die zustimmende Geste, nicht ihr Widerruf.
  const [puls, setPuls] = useState(false);

  function handleClick() {
    const next = !given;
    setGiven(next);
    if (next) setPuls(true);
    setCount((c) => c + (next ? 1 : -1));
    startTransition(async () => {
      const { ok } = await toggleKudos(completionId);
      if (!ok) {
        // Auch den Puls zurücknehmen: er quittiert eine Zustimmung, die es
        // nach dem Rollback nicht gab. Ohne das liefe die Animation noch zu
        // Ende, während Zähler und Zustand schon wieder auf dem alten Wert
        // stehen.
        setPuls(false);
        setGiven(!next);
        setCount((c) => c + (next ? -1 : 1));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={given}
      aria-label={given ? "Kudos zurückziehen" : "Kudos geben"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors duration-fast disabled:pointer-events-none disabled:opacity-50",
        given ? "text-accent" : "text-muted hover:text-foreground",
      )}
    >
      {/* Die Klasse wird am Ende der Animation wieder abgeräumt, damit ein
          zweites Geben erneut auslöst. Bei reduzierter Bewegung kürzt der
          globale Block in globals.css die Dauer auf 0.01 ms — animationend
          feuert dann sofort, die Flamme steht still. */}
      <Flame
        className={cn("h-3.5 w-3.5", puls && "kudos-puls")}
        aria-hidden="true"
        fill={given ? "currentColor" : "none"}
        onAnimationEnd={() => setPuls(false)}
      />
      <span className="font-mono tabular-nums">{count}</span>
    </button>
  );
}
