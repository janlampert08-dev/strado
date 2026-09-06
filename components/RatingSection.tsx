"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { submitRating, type RatingFormState } from "@/lib/actions/ratings";
import { reportRating } from "@/lib/actions/reports";
import type { RatingWithAuthor } from "@/lib/ratings";
import { Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ReportDialog from "@/components/ReportDialog";

const initialState: RatingFormState = { error: null };

export default function RatingSection({
  routeId,
  ratings,
  ownRating,
  canRate,
  currentUserId,
}: {
  routeId: string;
  ratings: RatingWithAuthor[];
  ownRating: { kommentar: string | null } | null;
  canRate: boolean;
  currentUserId?: string | null;
}) {
  const action = submitRating.bind(null, routeId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [reportRatingId, setReportRatingId] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
          Kommentare
        </h2>
        {ratings.length > 0 && (
          <span className="font-mono text-sm tabular-nums text-muted">
            {ratings.length}
          </span>
        )}
      </div>

      {/* Kommentieren bleibt angemeldeten Nutzern vorbehalten. Der Hinweis
          darauf stand früher auf der Streckenseite und deckte dort zugleich
          das Eintragen einer Fahrt ab — das braucht inzwischen kein Konto
          mehr, dieser Teil schon. Verlinkt zurück auf diese Strecke, damit
          der Kommentar danach dort landet, wo er gemeint war. */}
      {!canRate && (
        <p className="border-b border-border pb-4 text-sm text-muted">
          <Link
            href={`/anmelden?next=${encodeURIComponent(`/strecken/${routeId}`)}`}
            className="font-medium text-accent hover:underline"
          >
            Melde dich an
          </Link>
          , um diese Strecke zu bewerten.
        </p>
      )}

      {canRate && (
        <form action={formAction} className="flex flex-col gap-2 border-b border-border pb-4">
          <Textarea
            name="kommentar"
            defaultValue={ownRating?.kommentar ?? ""}
            placeholder="Kommentar"
            rows={2}
            maxLength={1000}
          />
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
            {ownRating ? "Kommentar aktualisieren" : "Kommentieren"}
          </Button>
        </form>
      )}

      {ratings.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Kommentare.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ratings.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <Link
                  href={`/fahrer/${r.user_id}`}
                  className="font-medium transition-colors duration-fast hover:text-accent"
                >
                  {r.display_name ?? "Anonym"}
                </Link>
                {r.kommentar && <p className="mt-0.5 text-muted">{r.kommentar}</p>}
              </div>
              {currentUserId && currentUserId !== r.user_id && (
                <button
                  type="button"
                  onClick={() => setReportRatingId(r.id)}
                  aria-label="Kommentar melden"
                  className="shrink-0 text-muted transition-colors duration-fast hover:text-danger"
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* key erzwingt einen Remount pro gemeldetem Kommentar, statt eine
          einzelne useActionState-Instanz (in ReportDialog) mit wechselnd
          gebundener Server Action wiederzuverwenden — sonst bestünde das
          Risiko, dass ein Formular-Submit noch die vorherige Bindung
          erwischt, falls React eine geänderte action-Prop nicht sofort für
          den nächsten Submit übernimmt. */}
      <ReportDialog
        key={reportRatingId ?? "closed"}
        open={reportRatingId !== null}
        onClose={() => setReportRatingId(null)}
        title="Kommentar melden"
        action={reportRating.bind(null, reportRatingId ?? "")}
      />
    </section>
  );
}
