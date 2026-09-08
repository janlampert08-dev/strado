"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/Dialog";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { logTrackedCompletion, type CompletionFormState } from "@/lib/actions/completions";
import { useRideRecorder } from "@/components/useRideRecorder";
import { useBewegungswarnung } from "@/components/useBewegungswarnung";
import {
  GUEST_TRACKING_USER_ID,
  issueGuestContinuationToken,
} from "@/lib/trackingStorage";
import { interpolateElevation } from "@/lib/elevation";
import { computeRouteCoverage, COVERAGE_THRESHOLD_PERCENT } from "@/lib/routeCoverage";
import { bewerteBewegungsprofil } from "@/lib/bewegungsprofil";
import { formatDuration } from "@/lib/format";
import RideSummaryForm from "@/components/RideSummaryForm";
import type { KartenStrecke, RouteGeoJSON, Vehicle } from "@/types/database";
import { buttonVariants } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import FullscreenDialog from "@/components/ui/FullscreenDialog";

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
  kontextStrecken,
  userId,
  vehicles,
  personalBestSeconds,
  guestContinuationToken = null,
  maxPhotos,
  onExit,
}: {
  route: RouteGeoJSON;
  // Umliegende freigegebene Strecken, nur zur Orientierung auf der Karte
  // ("was liegt hier sonst noch?"), gedimmt hinter der gefahrenen Strecke.
  // Weder anklickbar noch massgeblich für den Kartenausschnitt, und ohne
  // jeden Einfluss auf Start-/Zielgate (lib/tracking.ts) oder Deckungsgrad
  // (lib/routeCoverage.ts) — dasselbe Muster wie bei der freien Fahrt
  // (FreeRideForm.tsx).
  kontextStrecken: KartenStrecke[];
  // Nur für den localStorage-Schlüssel der Wiederherstellung — die Fahrt
  // selbst wird serverseitig dem angemeldeten Nutzer zugeordnet.
  //
  // null heisst: abgemeldeter Besucher. Aufzeichnen geht trotzdem, nur das
  // Speichern am Ende verlangt ein Konto (Gate im Fazit weiter unten) —
  // dieselbe Regel wie bei der freien Fahrt (FreeRideForm.tsx).
  userId: string | null;
  vehicles: Vehicle[];
  personalBestSeconds: number | null;
  // Marker aus ?fortsetzen=<token>, mit dem sich die Rückkehr aus dem
  // Anmelde-Gate ausweist (siehe adoptGuestTrackingSnapshot).
  guestContinuationToken?: string | null;
  /** Fotos pro Fahrt, aus dem Abo-Zustand (lib/premium.ts). */
  maxPhotos: number;
  onExit: () => void;
}) {
  const router = useRouter();
  const istGast = userId === null;
  const action = logTrackedCompletion.bind(null, route.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  // Stabile Array-Referenz für RouteMap — ein neues Literal bei jedem Render
  // würde RouteMaps "routes"-Effekt (Kartenausschnitt neu fitten) bei jedem
  // GPS-Update erneut auslösen und die Ansicht ständig zurücksetzen, obwohl
  // sich weder die gefahrene Strecke noch die Kontext-Strecken je ändern.
  //
  // Die gefahrene Strecke steht zuerst; hervorgehoben wird sie ohnehin über
  // primaryRouteId (RouteMap), das zugleich den Kartenausschnitt auf sie
  // allein einpasst.
  const routes = useMemo(() => [route, ...kontextStrecken], [route, kontextStrecken]);
  const gate = useMemo(
    () => ({
      startPoint: route.start_geojson.coordinates as [number, number],
      endPoint: route.ziel_geojson.coordinates as [number, number],
    }),
    [route],
  );

  // Der Schlüssel ist die Strecken-ID: eine Gastfahrt auf dieser Strecke
  // landet damit unter cornice:tracking:gast:<strecke> und kollidiert weder
  // mit einer freien Fahrt noch mit einer anderen Strecke.
  const recorder = useRideRecorder({
    userId: userId ?? GUEST_TRACKING_USER_ID,
    storageKey: route.id,
    gate,
    guestContinuationToken,
  });
  const { phase, result, finishedTrail, clearSnapshot, discard } = recorder;

  const [isPublic, setIsPublic] = useState(false);
  // Dieselbe Rückfrage wie im angemeldeten Pfad (RideSummaryForm).
  // Vorher verwarf ein einzelner Tap hier eine bereits FERTIGE
  // Aufzeichnung sofort und endgültig — ausgerechnet im Gast-Fall,
  // wo serverseitig noch nichts liegt und der lokale Snapshot die
  // einzige Kopie der Fahrt ist.
  const [gastVerwerfenOffen, setGastVerwerfenOffen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Früher Hinweis während der Fahrt und die abschliessende Beurteilung des
  // fertigen Trails im Fazit. Massgeblich ist beides nicht: abgelehnt wird
  // serverseitig in logTrackedCompletion, und auch dort nur ein Flug — das
  // Bahn-Verdikt fragt bloss nach (siehe lib/bewegungsprofil.ts).
  const bewegungswarnung = useBewegungswarnung(phase === "tracking", recorder.liveTrailPoints);
  const bewegungsbefund = useMemo(() => {
    if (phase !== "finished") return null;
    const profil = bewerteBewegungsprofil(finishedTrail);
    if (!profil.begruendung) return null;
    return { blockiert: profil.blockiert, text: profil.begruendung };
  }, [phase, finishedTrail]);

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

  // Wie in FreeRideForm: der einmalig einlösbare Marker entsteht im Moment
  // des Gate-Klicks, nicht beim Rendern. Rücksprungziel ist diese
  // Streckenseite — GefahrenSection klappt dort anhand des Markers von
  // selbst wieder auf, damit die Fahrt zum Speichern bereitsteht.
  function goToAuth(ziel: "/anmelden" | "/registrieren") {
    const token = issueGuestContinuationToken(route.id);
    const zurueck = token
      ? `/strecken/${route.id}?fortsetzen=${encodeURIComponent(token)}`
      : `/strecken/${route.id}`;
    router.push(`${ziel}?next=${encodeURIComponent(zurueck)}`);
  }

  // Gast-Übernahme fehlgeschlagen: Es lag ein ?fortsetzen=-Token vor, die
  // damit angekündigte Aufzeichnung war aber nicht mehr auffindbar (Token
  // älter als 2 h, anderer Browser, gesperrter Speicher). Der Recorder
  // startet dann bewusst nicht — hier steht, was passiert ist, statt dass
  // der Nutzer in einer leeren Aufzeichnung landet und glaubt, seine Fahrt
  // sei einfach verschwunden.
  if (recorder.uebernahmeGescheitert) {
    return (
      <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 overflow-y-auto bg-background pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 py-8 sm:px-6 sm:py-10">
          <Card surface className="flex flex-col gap-3 p-4 text-sm">
            <p className="font-medium text-foreground">
              Die aufgezeichnete Fahrt konnte nicht übernommen werden.
            </p>
            <p className="text-muted">
              Aufzeichnungen liegen nur in dem Browser, in dem sie entstanden sind. Wurde der
              Bestätigungslink auf einem anderen Gerät oder in einer anderen App geöffnet, oder ist
              zu viel Zeit vergangen, lässt sich die Fahrt nicht mehr zuordnen. Dein Konto ist
              angelegt — die Fahrt selbst ist leider verloren.
            </p>
            <button
              type="button"
              onClick={onExit}
              className={buttonVariants({ variant: "accent", size: "sm", className: "self-start" })}
            >
              Zurück zur Strecke
            </button>
          </Card>
        </div>
      </FullscreenDialog>
    );
  }

  if (phase === "idle") {
    return (
      <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background px-6 pt-[var(--safe-top)] pb-[var(--safe-bottom)] text-center">
        {recorder.locationError ? (
          <>
            <p role="alert" className="text-sm text-danger">{recorder.locationError}</p>
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
      </FullscreenDialog>
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
      <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 flex flex-col bg-background">
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
            // Hebt die gefahrene Strecke hervor und lässt die Kontext-Strecken
            // zurücktreten — und hält vor allem den Kartenausschnitt auf der
            // gefahrenen Strecke, statt auf alle mitgezeichneten einzupassen.
            primaryRouteId={route.id}
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
          {recorder.locationError && <p role="alert" className="text-sm text-danger">{recorder.locationError}</p>}
          {/* Zug/Flug erkannt: lieber jetzt sagen, dass diese Aufzeichnung
              nicht gespeichert werden kann, als erst im Fazit. */}
          {bewegungswarnung && (
            <p role="status" className="text-sm text-danger">
              {bewegungswarnung}
            </p>
          )}
          {/* Vorwarnung statt einer Überraschung am Ziel — siehe
              FreeRideForm.tsx. */}
          {istGast && (
            <p className="text-xs text-muted">
              Ohne Konto: aufzeichnen geht, zum Speichern der Fahrt brauchst du am Ende eine
              Anmeldung.
            </p>
          )}
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
      </FullscreenDialog>
    );
  }

  // phase === "finished" — Fazit als eigener Vollbild-Screen, keine
  // Streckendetails/Karte mehr im Blick.
  const avgKmh = result && result.seconds > 0 ? result.distanceKm / (result.seconds / 3600) : null;
  const isNewBest =
    result !== null && (personalBestSeconds === null || result.seconds < personalBestSeconds);

  return (
    <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 overflow-y-auto bg-background pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
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

        {/* Ohne Konto gibt es keine Historie, gegen die sich eine Bestzeit
            vergleichen liesse — "Erste erfasste Zeit für diese Strecke"
            wäre für einen Gast eine Aussage über ein Konto, das es noch
            nicht gibt. */}
        {!istGast &&
          (isNewBest ? (
            <p className="rounded-lg border border-accent bg-accent/5 px-3 py-2 text-sm font-medium text-accent">
              {personalBestSeconds === null
                ? "Erste erfasste Zeit für diese Strecke."
                : `Neue persönliche Bestzeit — bisher ${formatDuration(personalBestSeconds)}.`}
            </p>
          ) : (
            <p className="text-sm text-muted">
              Bisherige Bestzeit: {formatDuration(personalBestSeconds ?? 0)}
            </p>
          ))}

        {/* Was der Server beim Speichern ohnehin ablehnt, steht hier schon —
            mit Begründung, damit nicht nur "ging nicht" übrig bleibt. Das
            Formular bleibt bedienbar: die Ablehnung entscheidet der Server,
            nicht diese Anzeige. */}
        {bewegungsbefund && (
          <Card surface className="flex flex-col gap-2 p-4 text-sm">
            <p className="font-medium text-foreground">
              {bewegungsbefund.blockiert
                ? "Diese Fahrt lässt sich nicht speichern."
                : "Sieht das nach einer Autofahrt aus?"}
            </p>
            <p className="text-muted">{bewegungsbefund.text}</p>
          </Card>
        )}

        {/* Dasselbe Anmelde-Gate wie bei der freien Fahrt: aufzeichnen darf
            jeder, ein Konto braucht erst das Speichern. Die Aufzeichnung
            liegt bis dahin unter dem Gast-Schlüssel im Browser und wird nach
            der Anmeldung übernommen (adoptGuestTrackingSnapshot).
            Serverseitig ändert das nichts — logTrackedCompletion weist eine
            Fahrt ohne Session unabhängig davon ab. */}
        {istGast ? (
        <>
          <Card surface className="flex flex-col gap-3 p-4 text-sm">
            <p className="font-medium text-foreground">Strecke gefahren.</p>
            <p className="text-muted">
              Zum Speichern brauchst du ein Konto — damit zählt die Fahrt für deine Bestzeit auf
              dieser Strecke, für die Bestenlisten und dein Profil. Die Aufzeichnung bleibt so
              lange in diesem Browser (bis zu 24 Stunden) und wird nach der Anmeldung übernommen.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => goToAuth("/registrieren")}
                className={buttonVariants({ variant: "accent", size: "sm" })}
              >
                Konto erstellen
              </button>
              <button
                type="button"
                onClick={() => goToAuth("/anmelden")}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Ich habe ein Konto
              </button>
            </div>
            <button
              type="button"
              onClick={() => setGastVerwerfenOffen(true)}
              className="self-start text-xs text-muted underline hover:text-foreground"
            >
              Fahrt verwerfen
            </button>
          </Card>
          <ConfirmDialog
            open={gastVerwerfenOffen}
            title="Fahrt verwerfen?"
            description="Die aufgezeichnete Fahrt wurde noch nicht gespeichert und geht dabei endgültig verloren."
            confirmLabel="Verwerfen"
            variant="danger"
            onConfirm={handleExit}
            onCancel={() => setGastVerwerfenOffen(false)}
          />
        </>
        ) : (
          <RideSummaryForm
            maxPhotos={maxPhotos}
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
        )}
      </div>
    </FullscreenDialog>
  );
}
