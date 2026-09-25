"use client";

import { useState, useTransition } from "react";
import { setCompletionVisibility } from "@/lib/actions/completions";
import { SichtbarkeitIcon } from "@/components/VisibilityIcons";
import {
  SICHTBARKEITEN,
  SICHTBARKEIT_LABEL,
  teilenSperrGrund,
  type Sichtbarkeit,
} from "@/lib/sichtbarkeit";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";
import { Dialog } from "@/components/ui/Dialog";

const BESCHREIBUNG: Record<Sichtbarkeit, string> = {
  privat: "Nur du siehst diese Fahrt.",
  follower: "Wer dir folgt, sieht sie im Feed und auf deinem Profil. Nicht in den Ranglisten.",
  oeffentlich: "Alle sehen sie, auch in den Ranglisten.",
};

// Sichtbarkeit einer gespeicherten Fahrt, direkt in der Liste (Profil,
// erkannte Abschnitte). Seit 0145 drei Stufen statt eines Umschalters.
//
// Eine Auswahl im Dialog statt eines Durchschaltens per Tipp: das führte
// von "privat" nach "öffentlich" über eine Zwischenstufe, die niemand
// wollte. Und ein Dialog statt eines Aufklappmenüs, weil beide Listen, in
// denen der Knopf steht, overflow-hidden tragen — ein absolut positioniertes
// Menü würde an ihrer Unterkante abgeschnitten. Das native <dialog> liegt
// im Top-Layer, darüber.
export default function RideVisibilityToggle({
  completionId,
  sichtbarkeit,
  coveragePercent,
  blockedReason = null,
  stufen = SICHTBARKEITEN,
}: {
  completionId: string;
  sichtbarkeit: Sichtbarkeit;
  // Welche Stufen angeboten werden. Erkannte Abschnitte folgen seit 0151
  // der Öffentlichkeit ihrer Fahrt und bekommen deshalb keine eigene
  // Follower-Stufe, die beim Privatstellen der Fahrt stehen bliebe.
  stufen?: readonly Sichtbarkeit[];
  // Nur bei Streckenfahrten gesetzt — dort entscheidet der Deckungsgrad.
  coveragePercent: number | null;
  // Grund, warum die Fahrt nicht geteilt werden kann (zu kurze freie Fahrt,
  // importiert) — geht dem Deckungsgrad vor, siehe teilenSperrGrund.
  blockedReason?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Teilen — mit Followern wie mit allen — hängt an denselben Hürden.
  const sperrGrund = teilenSperrGrund(coveragePercent, blockedReason);

  function waehle(ziel: Sichtbarkeit) {
    setOpen(false);
    if (ziel === sichtbarkeit) return;
    startTransition(async () => {
      const result = await setCompletionVisibility(completionId, ziel);
      setError(result.error);
    });
  }

  return (
    <div className="relative shrink-0">
      <IconButton
        ton={sichtbarkeit === "privat" ? "neutral" : "aktiv"}
        aria-haspopup="dialog"
        aria-label={`Sichtbarkeit: ${SICHTBARKEIT_LABEL[sichtbarkeit]} — ändern`}
        title={`${SICHTBARKEIT_LABEL[sichtbarkeit]} — ${BESCHREIBUNG[sichtbarkeit]}`}
        disabled={pending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <SichtbarkeitIcon sichtbarkeit={sichtbarkeit} className="h-5 w-5" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title="Wer sieht diese Fahrt?">
        <div role="radiogroup" aria-label="Sichtbarkeit der Fahrt" className="flex flex-col gap-2">
          {stufen.map((stufe) => {
            const gesperrt = stufe !== "privat" && sperrGrund !== null;
            const aktiv = stufe === sichtbarkeit;
            return (
              <button
                key={stufe}
                type="button"
                role="radio"
                aria-checked={aktiv}
                disabled={gesperrt}
                onClick={() => waehle(stufe)}
                className={`flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-fast disabled:opacity-50 ${
                  aktiv ? "border-foreground" : "border-border hover:bg-surface"
                }`}
              >
                <SichtbarkeitIcon
                  sichtbarkeit={stufe}
                  className={`mt-0.5 h-4 w-4 shrink-0 ${aktiv ? "text-foreground" : "text-muted"}`}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {SICHTBARKEIT_LABEL[stufe]}
                  </span>
                  <span className="text-xs text-muted">
                    {gesperrt ? sperrGrund : BESCHREIBUNG[stufe]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Dialog>
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
