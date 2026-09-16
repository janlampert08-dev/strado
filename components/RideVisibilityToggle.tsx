"use client";

import { useState, useTransition } from "react";
import { toggleCompletionVisibility } from "@/lib/actions/completions";
import { GlobeIcon, LockIcon } from "@/components/VisibilityIcons";
import { COVERAGE_THRESHOLD_PERCENT } from "@/lib/routeCoverage";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";

export default function RideVisibilityToggle({
  completionId,
  isPublic,
  coveragePercent,
  blockedReason = null,
}: {
  completionId: string;
  isPublic: boolean;
  // Nur bei Streckenfahrten gesetzt — dort entscheidet der Deckungsgrad.
  coveragePercent: number | null;
  // Bei freien Fahrten steht hier der Grund, warum sie nicht geteilt werden
  // kann (zu kurz), statt des Deckungsgrads — siehe publicationBlockReason
  // in lib/track.ts.
  blockedReason?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const belowThreshold =
    coveragePercent !== null && coveragePercent < COVERAGE_THRESHOLD_PERCENT;
  const blocked = !isPublic && (belowThreshold || blockedReason !== null);

  return (
    <div className="relative shrink-0">
      <IconButton
        ton={isPublic ? "aktiv" : "neutral"}
        aria-pressed={isPublic}
        aria-label={isPublic ? "Fahrt ist öffentlich — privat machen" : "Fahrt ist privat — öffentlich machen"}
        title={
          isPublic
            ? "Öffentlich — auf Bestenlisten/Profil sichtbar. Klicken um privat zu machen."
            : blocked
              ? (blockedReason ??
                `Kann nicht öffentlich gemacht werden — deckt nur ${Math.round(coveragePercent ?? 0)}% der Strecke ab.`)
              : "Privat — nur für dich sichtbar. Klicken um öffentlich zu machen."
        }
        disabled={pending || blocked}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleCompletionVisibility(completionId);
            setError(result.error);
          })
        }
      >
        {isPublic ? <GlobeIcon className="h-5 w-5" /> : <LockIcon className="h-5 w-5" />}
      </IconButton>
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
