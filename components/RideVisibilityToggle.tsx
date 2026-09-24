"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setCompletionVisibility } from "@/lib/actions/completions";
import { SichtbarkeitIcon } from "@/components/VisibilityIcons";
import { COVERAGE_THRESHOLD_PERCENT } from "@/lib/routeCoverage";
import {
  SICHTBARKEITEN,
  SICHTBARKEIT_LABEL,
  type Sichtbarkeit,
} from "@/lib/sichtbarkeit";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";

const BESCHREIBUNG: Record<Sichtbarkeit, string> = {
  privat: "Nur für dich",
  follower: "Für Leute, die dir folgen",
  oeffentlich: "Für alle, auch in Ranglisten",
};

// Sichtbarkeit einer gespeicherten Fahrt, direkt in der Liste (Profil,
// erkannte Abschnitte). Seit 0140 drei Stufen statt eines Umschalters —
// deshalb ein kleines Menü: ein Durchschalten per Tipp führte von "privat"
// zu "öffentlich" über eine Zwischenstufe, die niemand wollte.
export default function RideVisibilityToggle({
  completionId,
  sichtbarkeit,
  coveragePercent,
  blockedReason = null,
}: {
  completionId: string;
  sichtbarkeit: Sichtbarkeit;
  // Nur bei Streckenfahrten gesetzt — dort entscheidet der Deckungsgrad.
  coveragePercent: number | null;
  // Bei freien Fahrten steht hier der Grund, warum sie nicht geteilt werden
  // kann (zu kurz), statt des Deckungsgrads — siehe publicationBlockReason
  // in lib/track.ts.
  blockedReason?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const ausloeserRef = useRef<HTMLButtonElement>(null);

  const belowThreshold =
    coveragePercent !== null && coveragePercent < COVERAGE_THRESHOLD_PERCENT;
  // Teilen — mit Followern wie mit allen — hängt an denselben Hürden.
  const teilenGesperrt = belowThreshold || blockedReason !== null;
  const sperrGrund =
    blockedReason ??
    `Kann nicht geteilt werden — deckt nur ${Math.round(coveragePercent ?? 0)}% der Strecke ab.`;

  // Klick daneben und Escape schliessen, Fokus zurück an den Auslöser —
  // dasselbe Verhalten wie CompletionActionsMenu.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const fokusIstDrin = containerRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (fokusIstDrin) ausloeserRef.current?.focus();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function waehle(ziel: Sichtbarkeit) {
    setOpen(false);
    ausloeserRef.current?.focus();
    if (ziel === sichtbarkeit) return;
    startTransition(async () => {
      const result = await setCompletionVisibility(completionId, ziel);
      setError(result.error);
    });
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <IconButton
        ref={ausloeserRef}
        ton={sichtbarkeit === "privat" ? "neutral" : "aktiv"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sichtbarkeit: ${SICHTBARKEIT_LABEL[sichtbarkeit]} — ändern`}
        title={`${SICHTBARKEIT_LABEL[sichtbarkeit]} — ${BESCHREIBUNG[sichtbarkeit]}`}
        disabled={pending}
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
        }}
      >
        <SichtbarkeitIcon sichtbarkeit={sichtbarkeit} className="h-5 w-5" />
      </IconButton>
      {open && (
        <Card
          elevated
          as="div"
          role="menu"
          aria-label="Sichtbarkeit der Fahrt"
          className="absolute top-full right-0 z-10 mt-1 flex w-64 flex-col overflow-hidden"
        >
          {SICHTBARKEITEN.map((stufe) => {
            const gesperrt = stufe !== "privat" && teilenGesperrt;
            const aktiv = stufe === sichtbarkeit;
            return (
              <button
                key={stufe}
                type="button"
                role="menuitemradio"
                aria-checked={aktiv}
                disabled={gesperrt}
                title={gesperrt ? sperrGrund : undefined}
                onClick={() => waehle(stufe)}
                className="flex items-start gap-2 border-t border-border px-3 py-2 text-left first:border-t-0 hover:bg-surface disabled:pointer-events-none disabled:opacity-50"
              >
                <SichtbarkeitIcon
                  sichtbarkeit={stufe}
                  className={`mt-0.5 h-4 w-4 shrink-0 ${aktiv ? "text-accent" : "text-muted"}`}
                />
                <span className="flex flex-col">
                  <span className={`text-sm ${aktiv ? "font-medium text-foreground" : "text-foreground"}`}>
                    {SICHTBARKEIT_LABEL[stufe]}
                  </span>
                  <span className="text-xs text-muted">
                    {gesperrt ? sperrGrund : BESCHREIBUNG[stufe]}
                  </span>
                </span>
              </button>
            );
          })}
        </Card>
      )}
      {error && (
        <Card
          elevated
          className="absolute top-full right-0 z-10 mt-1 w-48 p-2 text-right text-sm text-danger"
        >
          {error}
        </Card>
      )}
    </div>
  );
}
