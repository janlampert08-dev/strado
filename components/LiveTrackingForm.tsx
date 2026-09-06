"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { logTrackedCompletion, type CompletionFormState } from "@/lib/actions/completions";
import { useRideRecorder } from "@/components/useRideRecorder";
import { interpolateElevation } from "@/lib/elevation";
import { computeRouteCoverage, COVERAGE_THRESHOLD_PERCENT } from "@/lib/routeCoverage";
import { formatDuration } from "@/lib/format";
import RideSummaryForm from "@/components/RideSummaryForm";
import type { RouteGeoJSON, Vehicle } from "@/types/database";
import { buttonVariants } from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";

// Siehe ExploreView.tsx für die Begründung des dynamischen Imports.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const initialState: CompletionFormState = { error: null };

// Aufzeichnung einer Streckenfahrt: Start und Stopp laufen automatisch über
// die Nähe zu Start-/Zielpunkt der Strecke, und der Deckungsgrad entscheidet
// darüber, ob die Fahrt öffentlich sein darf. Die GPS-Mechanik selbst steckt
// in useRideRecorder, das Fazit-Formular in RideSummaryForm — beides teilt
// sich diese Komponente mit FreeRideForm (freie Fahrt ohne Strecke).
export default function LiveTrackingForm({
  route,
  userId,
  vehicles,
  personalBestSeconds,
  onExit,
}: {
  route: RouteGeoJSON;
  // Nur für den localStorage-Schlüssel der Wiederherstellung — die Fahrt
  // selbst wird serverseitig dem angemeldeten Nutzer zugeordnet.
  userId: string;
  vehicles: Vehicle[];
  personalBestSeconds: number | null;
  onExit: () => void;
}) {
  const router = useRouter();
  const action = logTrackedCompletion.bind(null, route.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  // Stabile Array-Referenz für RouteMap — ein neues [route]-Literal bei
  // jedem Render würde RouteMaps "routes"-Effekt (Kartenausschnitt neu
  // fitten) bei jedem GPS-Update erneut auslösen und die Ansicht ständig
  // zurücksetzen, obwohl sich die Strecke selbst nie ändert.
  const routes = useMemo(() => [route], [route]);
  const gate = useMemo(
    () => ({
      startPoint: route.start_geojson.coordinates as [number, number],
      endPoint: route.ziel_geojson.coordinates as [number, number],
    }),
    [route],
  );

  const recorder = useRideRecorder({ userId, storageKey: route.id, gate });
  const { phase, result, finishedTrail, clearSnapshot, discard } = recorder;

  const [isPublic, setIsPublic] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const coveragePercent = useMemo(() => {
    if (phase !== "finished") return null;
    return computeRouteCoverage(
      route.geometry_geojson.coordinates as [number, number][],
      finishedTrail.map((p) => [p.lng, p.lat] as [number, number]),
    );
  }, [phase, finishedTrail, route]);

  const belowCoverageThreshold =
    coveragePercent !== null && coveragePercent < COVERAGE_THRESHOLD_PERCENT;

  // Nach erfolgreichem Speichern direkt auf die neue Fahrt — dort liegen
  // Teilen, Kudos und die Fotogalerie, die vom Fazit-Screen aus sonst nicht
  // erreichbar wären (gleiche Weiterleitung wie bei einer freien Fahrt,
  // siehe FreeRideForm.tsx). Fehlt die completionId wider Erwarten, bleibt
  // der bisherige Weg zurück zur Streckenansicht — der Vollbild-Fazit-Screen
  // darf nie eine Sackgasse ohne Ausweg sein.
  useEffect(() => {
    if (submitted && !pending && !state.error) {
      clearSnapshot();
      if (state.completionId) {
        router.push(`/fahrten/${state.completionId}`);
      } else {
        onExit();
      }
    }
  }, [submitted, pending, state.error, state.completionId, onExit, clearSnapshot, router]);

  function handleExit() {
    discard();
    onExit();
  }

  if (phase === "idle") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background px-6 pt-[var(--safe-top)] pb-[var(--safe-bottom)] text-center">
        {recorder.locationError ? (
          <>
            <p className="text-sm text-danger">{recorder.locationError}</p>
            <button
              type="button"
              onClick={onExit}
              className={buttonVariants({ variant: "secondary" })}
            >
              Zurück
            </button>
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
            />
            <p className="text-sm text-muted">Standort wird ermittelt…</p>
          </>
        )}
      </div>
    );
  }

  if (phase === "tracking") {
    const remainingKm =
      route.laenge_km > 0 ? Math.max(route.laenge_km - recorder.distanceKm, 0) : null;
    const currentElevationM = route.hoehenprofil
      ? interpolateElevation(route.hoehenprofil, recorder.distanceKm)
      : null;

    // Volle Bildschirmfläche statt eines Inline-Blocks in der Streckenansicht
    // — während einer laufenden Aufzeichnung sind die Streckendetails
    // ausgeblendet, stattdessen zeigt die Karte Route und Live-Standort.
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="min-h-0 flex-1">
          <RouteMap
            routes={routes}
            // Die Karte liegt hier im Vollbild über der Streckenseite. Ohne
            // das würde ein versehentlicher Tap auf die Streckenlinie zurück
            // auf /strecken/<id> navigieren, diese Komponente aushängen und
            // damit die laufende Aufzeichnung abbrechen. Das Einpassen auf
            // die Strecke bleibt dagegen an — siehe centerOnFirstLocation
            // weiter unten.
            routesClickable={false}
            userLocation={recorder.position}
            userAccuracyM={recorder.accuracyM}
            userHeadingDeg={recorder.headingDeg}
            // Vor dem Start bleibt die volle Streckenübersicht sichtbar (die
            // anfängliche fitToRoutes-Ansicht), damit erkennbar ist, wo der
            // Startpunkt relativ zum eigenen Standort liegt. Erst sobald die
            // Zeitmessung tatsächlich läuft, springt die Karte einmalig
            // näher heran und folgt danach laufend dem GPS-Standort — wie
            // eine Navi-App während der Fahrt, statt der festen
            // Streckenansicht davor.
            centerOnFirstLocation={recorder.hasStarted}
            followLocation={recorder.hasStarted}
          />
        </div>
        <div className="flex flex-col gap-3 border-t border-border-strong bg-background p-4 pb-[calc(1rem+var(--safe-bottom))]">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {recorder.hasStarted ? "Aufzeichnung läuft" : "Unterwegs zum Start"}
          </p>
          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <div>
              <dt className="text-xs text-muted">Distanz</dt>
              <dd className="font-mono text-xl tabular-nums">
                {recorder.distanceKm.toFixed(2)} km
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Zeit</dt>
              <dd className="font-mono text-xl tabular-nums">
                {formatDuration(recorder.elapsedSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Tempo</dt>
              <dd className="font-mono text-lg tabular-nums">
                {recorder.speedKmh !== null ? `${recorder.speedKmh.toFixed(0)} km/h` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Höhe</dt>
              <dd className="font-mono text-lg tabular-nums">
                {currentElevationM !== null ? `${currentElevationM} m` : "—"}
              </dd>
            </div>
            {remainingKm !== null && (
              <div>
                <dt className="text-xs text-muted">Noch</dt>
                <dd className="font-mono text-lg tabular-nums">{remainingKm.toFixed(1)} km</dd>
              </div>
            )}
          </dl>
          {!recorder.hasStarted && (
            <p className="text-sm text-muted">
              <span className="font-medium text-foreground">Fahre zum Startpunkt</span> —{" "}
              {recorder.distanceToStartKm !== null
                ? `noch ca. ${
                    recorder.distanceToStartKm < 1
                      ? `${Math.round(recorder.distanceToStartKm * 1000)} m`
                      : `${recorder.distanceToStartKm.toFixed(1)} km`
                  }, die Zeitmessung startet automatisch, sobald du dort bist.`
                : "Standort wird ermittelt…"}
            </p>
          )}
          {recorder.locationError && <p className="text-sm text-danger">{recorder.locationError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {recorder.hasStarted ? (
              <button
                type="button"
                onClick={recorder.stop}
                className={buttonVariants({ variant: "accent" })}
              >
                Strecke beenden
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExit}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={recorder.beginNow}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Bin schon am Start
                </button>
              </div>
            )}
            <p className="text-xs text-muted">
              Bildschirm eingeschaltet lassen — GPS-Tracking im Browser pausiert sonst.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // phase === "finished" — Fazit als eigener Vollbild-Screen, keine
  // Streckendetails/Karte mehr im Blick.
  const avgKmh = result && result.seconds > 0 ? result.distanceKm / (result.seconds / 3600) : null;
  const isNewBest =
    result !== null && (personalBestSeconds === null || result.seconds < personalBestSeconds);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 py-8 sm:px-6 sm:py-10">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Fazit</h2>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">Distanz</dt>
            <dd className="font-mono text-lg tabular-nums">{result?.distanceKm.toFixed(2)} km</dd>
          </div>
          <div>
            <dt className="text-muted">Zeit</dt>
            <dd className="font-mono text-lg tabular-nums">{formatDuration(result?.seconds ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">Ø Tempo</dt>
            <dd className="font-mono text-lg tabular-nums">{avgKmh?.toFixed(0)} km/h</dd>
          </div>
        </dl>

        {isNewBest ? (
          <p className="rounded-lg border border-accent bg-accent/5 px-3 py-2 text-sm font-medium text-accent">
            {personalBestSeconds === null
              ? "Erste erfasste Zeit für diese Strecke."
              : `Neue persönliche Bestzeit — bisher ${formatDuration(personalBestSeconds)}.`}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Bisherige Bestzeit: {formatDuration(personalBestSeconds ?? 0)}
          </p>
        )}

        <RideSummaryForm
          formAction={formAction}
          pending={pending}
          error={state.error}
          vehicles={vehicles}
          trailJson={recorder.trailJson}
          isPublic={isPublic}
          onIsPublicChange={setIsPublic}
          onSubmit={() => setSubmitted(true)}
          onDiscard={handleExit}
          visibility={{
            publicDisabled: belowCoverageThreshold,
            publicDisabledHint: `Diese Fahrt deckt nur ${coveragePercent}% der offiziellen Strecke ab — evtl. abgekürzt oder am falschen Punkt gestartet/beendet. Sie bleibt privat gespeichert, kann aber nicht öffentlich geteilt werden.`,
            publicHint:
              "Öffentlich: erscheint auf Bestenlisten und deinem öffentlichen Profil. Später jederzeit umschaltbar.",
            privateHint:
              "Privat: nur du siehst diese Fahrt in deinem Profil, für andere bleibt sie unsichtbar. Später jederzeit umschaltbar.",
          }}
        />
      </div>
    </div>
  );
}
