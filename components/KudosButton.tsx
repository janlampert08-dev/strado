"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Flame } from "@/components/NavIcons";
import { toggleKudos } from "@/lib/actions/kudos";
import { cn } from "@/lib/utils/cn";

// Gleiches optimistisches Toggle-Muster wie FavoriteButton.tsx, zusätzlich
// mit lokal mitgeführtem Zähler (±1 bei Klick, kein Re-Fetch nötig).
//
// Der Fehlerfall ist sichtbar statt still: Schlug das Speichern fehl
// (abgelaufene Sitzung, Cooldown, Datenbankfehler), rollte der Button bis
// hierher lautlos zurück — Zähler und Flamme sprangen ohne ein Wort zurück,
// und "die Flamme wird nicht blau" las sich als defekter Button statt als
// gescheiterter Aufruf. Jetzt steht der Grund daneben und der Versuch lässt
// sich wiederholen.
const FEHLER_TIMEOUT_MS = 4000;
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
  // Warum der letzte Versuch scheiterte ("auth": Sitzung abgelaufen,
  // "fehler": alles andere) — null heisst: kein Fehler anstehend.
  const [fehler, setFehler] = useState<null | "auth" | "fehler">(null);
  const fehlerTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (fehlerTimer.current !== null) window.clearTimeout(fehlerTimer.current);
    },
    [],
  );

  function fehlerZeigen(grund: "auth" | "fehler") {
    if (fehlerTimer.current !== null) window.clearTimeout(fehlerTimer.current);
    setFehler(grund);
    fehlerTimer.current = window.setTimeout(() => {
      fehlerTimer.current = null;
      setFehler(null);
    }, FEHLER_TIMEOUT_MS);
  }

  function handleClick() {
    // Neuer Versuch, alter Hinweis ist hinfällig — sonst stünde "nicht
    // gespeichert" noch da, während der neue Aufruf schon läuft.
    if (fehlerTimer.current !== null) {
      window.clearTimeout(fehlerTimer.current);
      fehlerTimer.current = null;
    }
    setFehler(null);
    const next = !given;
    setGiven(next);
    if (next) setPuls(true);
    setCount((c) => c + (next ? 1 : -1));
    startTransition(async () => {
      const { ok, grund } = await toggleKudos(completionId);
      if (!ok) {
        // Auch den Puls zurücknehmen: er quittiert eine Zustimmung, die es
        // nach dem Rollback nicht gab. Ohne das liefe die Animation noch zu
        // Ende, während Zähler und Zustand schon wieder auf dem alten Wert
        // stehen.
        setPuls(false);
        setGiven(!next);
        setCount((c) => c + (next ? -1 : 1));
        fehlerZeigen(grund ?? "fehler");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={given}
        aria-label={given ? "Kudos zurückziehen" : "Kudos geben"}
        className={cn(
          // min-h-11/min-w-11: das ist die Reaktion des Kernloops (AGENTS.md,
          // Schritt 7) und stand mit px-2 py-1 auf 24 px Höhe — unter jeder
          // Tippgrenze, die diese App sonst einhält (components/ui/IconButton
          // begründet die 44). Optik unverändert: kein Rahmen, keine Füllung,
          // nur die Fläche stimmt.
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium transition-colors duration-fast disabled:pointer-events-none disabled:opacity-50",
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
        <span className="tabular-nums">{count}</span>
      </button>
      {/* Antwort auf den gerade gescheiterten Versuch — role="alert", damit
          sie angesagt wird (gleiches Muster wie locationError in
          ExploreSidebar.tsx). Ausserhalb des Buttons: Der Hinweis ist kein
          Teil der Handlung und gehört nicht in ihre Beschriftung. Er
          verschwindet von selbst oder beim nächsten Versuch. */}
      {fehler && (
        <span role="alert" className="shrink-0 text-xs text-danger">
          {fehler === "auth"
            ? "Sitzung abgelaufen – bitte melde dich erneut an."
            : "Nicht gespeichert – versuch es gleich erneut."}
        </span>
      )}
    </>
  );
}
