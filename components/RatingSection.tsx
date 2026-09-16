"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { submitRating, type RatingFormState } from "@/lib/actions/ratings";
import { reportRating } from "@/lib/actions/reports";
import type { RatingWithAuthor } from "@/lib/ratings";
import { anzahlText, type Streckenbewertung } from "@/lib/bewertungen";
import { Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Sterne from "@/components/Sterne";
import Sternschnitt from "@/components/Sternschnitt";
import SterneEingabe from "@/components/SterneEingabe";
import ReportDialog from "@/components/ReportDialog";
import DeleteRatingButton from "@/components/DeleteRatingButton";
import useEingabenBewahren from "@/components/useEingabenBewahren";
import { SternIcon } from "@/components/NavIcons";
import SectionHeading from "@/components/ui/SectionHeading";
import IconButton from "@/components/ui/IconButton";

const initialState: RatingFormState = { error: null };

export default function RatingSection({
  routeId,
  ratings,
  ownRating,
  bewertung,
  canRate,
  currentUserId,
}: {
  routeId: string;
  ratings: RatingWithAuthor[];
  ownRating: { kommentar: string | null; sterne: number | null } | null;
  /** Schnitt und Anzahl über alle Wertungen dieser Strecke, oder null. */
  bewertung: Streckenbewertung | null;
  canRate: boolean;
  currentUserId?: string | null;
}) {
  const action = submitRating.bind(null, routeId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [reportRatingId, setReportRatingId] = useState<string | null>(null);
  // Eine abgewiesene Bewertung (Cooldown, zu lang) soll nicht bedeuten, dass
  // man sie neu tippt — siehe components/useEingabenBewahren.ts. Nach einem
  // ERFOLGREICHEN Speichern gewinnt weiterhin der key-Remount unten: dessen
  // frischer defaultValue ersetzt den Knoten, in den hier geschrieben würde.
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionHeading icon={SternIcon}>Bewertungen</SectionHeading>
        {/* Der Schnitt steht in der Überschrift, nicht als eigener Kasten:
            er ist die Zusammenfassung dessen, was darunter steht, und eine
            Zahl, die sich in einer Zeile mit dem Titel lesen lässt, kostet
            keine Fläche. Ohne eine einzige Wertung steht hier nichts — "0.0"
            wäre eine Aussage über die Strecke, und zwar eine falsche. */}
        {bewertung && (
          <p className="flex items-center gap-2">
            <Sternschnitt schnitt={bewertung.schnitt} />
            <span className="text-sm text-muted">{anzahlText(bewertung.anzahl)}</span>
          </p>
        )}
      </div>

      {/* Bewerten bleibt angemeldeten Nutzern vorbehalten. Der Hinweis
          darauf stand früher auf der Streckenseite und deckte dort zugleich
          das Eintragen einer Fahrt ab — das braucht inzwischen kein Konto
          mehr, dieser Teil schon. Verlinkt zurück auf diese Strecke, damit
          die Bewertung danach dort landet, wo sie gemeint war. */}
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
        <form
          ref={formRef}
          action={formAction}
          className="flex flex-col gap-3 border-b border-border pb-4"
        >
          {/* key wie beim Textfeld darunter: die Sternwahl hält ihren Wert
              in eigenem State und übernähme einen geänderten Anfangswert
              sonst nicht — nach dem Löschen der eigenen Bewertung stünden
              die alten Sterne weiter da. */}
          <SterneEingabe key={ownRating?.sterne ?? "ohne"} anfangswert={ownRating?.sterne ?? null} />

          {/* key erzwingt einen Remount, wenn sich der eigene Kommentar
              serverseitig geändert hat. Das Feld ist unkontrolliert, ein
              neuer defaultValue allein würde den bereits gerenderten Text
              also nicht ersetzen — nach dem Löschen stünde der gelöschte
              Kommentar weiter im Formular. */}
          <Textarea
            key={ownRating?.kommentar ?? "leer"}
            name="kommentar"
            defaultValue={ownRating?.kommentar ?? ""}
            placeholder="Kommentar (optional)"
            rows={2}
            maxLength={1000}
          />
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
            {ownRating ? "Bewertung aktualisieren" : "Bewerten"}
          </Button>
        </form>
      )}

      {ratings.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Bewertungen.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ratings.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Link
                    href={`/fahrer/${r.user_id}`}
                    // -my-1.5 py-1.5: der Name ist ein Byline-Link, kein
                    // Knopf — textAktionClassName mit seinen 44 px wäre
                    // hier falsch, es risse die Zeile auseinander, in der
                    // Name und Sterne nebeneinander stehen. 20 px sind aber
                    // auch als Byline zu wenig: WCAG 2.2 SC 2.5.8 verlangt
                    // 24. Am Preview auf 390 px gemessen waren es 24 × 20.
                    // Die 12 px Polsterung heben das auf 32 und das
                    // negative Aussenmass nimmt sie optisch wieder weg.
                    className="-my-1.5 py-1.5 font-medium transition-colors duration-fast hover:text-accent"
                  >
                    {r.display_name ?? "Anonym"}
                  </Link>
                  {/* Nur wenn diese Person tatsächlich Sterne vergeben hat.
                      Eine Zeile ohne Wertung ist seit 0025 der Normalfall
                      und keine Null-Wertung — fünf leere Sterne daneben
                      läsen sich aber genau so. */}
                  {r.sterne !== null && (
                    <span className="flex items-center gap-1">
                      <Sterne wert={r.sterne} sterneClassName="h-3 w-3" />
                      <span className="sr-only">
                        {r.sterne} von 5 Sternen
                      </span>
                    </span>
                  )}
                </div>
                {r.kommentar && <p className="mt-0.5 text-muted">{r.kommentar}</p>}
              </div>
              {currentUserId === r.user_id ? (
                <DeleteRatingButton ratingId={r.id} />
              ) : (
                currentUserId && (
                  <IconButton
                    onClick={() => setReportRatingId(r.id)}
                    ton="gefahr"
                    title="Bewertung melden"
                    aria-label="Bewertung melden"
                  >
                    <Flag className="h-5 w-5" aria-hidden="true" />
                  </IconButton>
                )
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
        title="Bewertung melden"
        action={reportRating.bind(null, reportRatingId ?? "")}
      />
    </section>
  );
}
