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
import { Smartphone } from "lucide-react";
import { buttonVariants, textAktionClassName } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import FullscreenDialog from "@/components/ui/FullscreenDialog";
import HalteKnopf from "@/components/ui/HalteKnopf";
import FazitKopf from "@/components/FazitKopf";
import { zeigeHinweis } from "@/components/Hinweis";

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

  // Wie in FreeRideForm: eine verworfene Fahrt bekommt eine Quittung. Hier
  // bleibt die Seite dieselbe (die Streckenseite klappt nur ein), also sofort.
  function handleDiscard() {
    handleExit();
    zeigeHinweis("Fahrt verworfen.");
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
        <div className="md:mx-auto md:w-full md:max-w-lg md:rounded-t-lg md:border-x flex flex-col gap-3 border-t border-border-strong bg-background p-4 pb-[calc(1rem+var(--safe-bottom))]">
          {/* DER EINZIGE SCHIRM DER APP, DER IN BEWEGUNG GELESEN WIRD —
              und bis hierher beschriftete er seine Zahlen in text-xs, also
              12 px, und zeigte fünf Werte in grid-cols-3, davon zwei in
              text-xl und drei in text-lg. Gleiche Rolle, zwei Grössen, und
              auf 390 px rund 120 px Spaltenbreite je Wert.

              Jetzt zwei Zahlen gross und der Rest in einer Zeile. Gross sind
              die beiden HANDLUNGSLEITENDEN: die gefahrene Zeit — das, was
              die Bestenliste misst — und "noch … km", der einzige Wert, aus
              dem sich in dem Moment eine Entscheidung ableiten lässt.
              Distanz, Tempo und Höhe sind interessant, aber nicht
              handlungsleitend; sie stehen darunter in 15 px statt in eigenen
              Spalten. Siehe docs/design-vereinfachung.md, Anhang B2. */}
          {/* Satzschreibung statt versal in Mono — ein Zustand, kein
              Etikett. Dieselbe Zeile wie bei der freien Fahrt. */}
          <p className="flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${recorder.hasStarted && !recorder.pausiert ? "bg-danger" : "bg-muted"}`}
            />
            {recorder.pausiert ? "Pausiert" : recorder.hasStarted ? "Aufzeichnung läuft" : "Unterwegs zum Start"}
          </p>
          {/* Ehrlich zur Wertung: die Bestzeit misst der Server von Start bis
              Ziel als Wanduhr (0098). Eine Pause verschwindet aus der
              angezeigten Zeit, nicht aus der gewerteten. */}
          {recorder.pausiert && (
            <p className="text-sm text-muted">
              Pausen zählen für die Bestzeit auf dieser Strecke mit.
            </p>
          )}
          <dl className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <dt className="text-xs text-muted">Zeit</dt>
              <dd className="text-5xl leading-none font-semibold tracking-tight tabular-nums">
                {formatDuration(recorder.elapsedSeconds)}
              </dd>
            </div>
            {remainingKm !== null && (
              <div>
                <dt className="text-xs text-accent">noch</dt>
                <dd className="text-5xl leading-none font-semibold tracking-tight tabular-nums text-accent">
                  {remainingKm.toFixed(1)}
                  <span className="ml-1.5 text-base font-medium tracking-normal"> km</span>
                </dd>
              </div>
            )}
            {/* Die drei übrigen Werte als Fliesstext statt als Spalten. Ein
                sr-only-dt je Wert, damit Hilfstechnik die Paarung behält —
                sichtbar trägt die Einheit die Bedeutung. */}
            {/* Der Mittelpunkt steht IM folgenden <dd>, nicht daneben: ein
                <div> in einem <dl> darf nur <dt> und <dd> enthalten, ein
                <span> dazwischen ist ungültiges HTML. aria-hidden hält ihn
                wie zuvor aus der Vorlesereihenfolge heraus. */}
            <div className="flex w-full flex-wrap items-baseline gap-x-2 text-base text-foreground">
              <dt className="sr-only">Distanz</dt>
              <dd className="tabular-nums">{recorder.distanceKm.toFixed(2)} km gefahren</dd>
              <dt className="sr-only">Tempo</dt>
              <dd className="tabular-nums">
                <span aria-hidden="true" className="mr-2">·</span>
                {recorder.speedKmh !== null ? `${recorder.speedKmh.toFixed(0)} km/h` : "—"}
              </dd>
              <dt className="sr-only">Höhe</dt>
              <dd className="tabular-nums">
                <span aria-hidden="true" className="mr-2">·</span>
                {currentElevationM !== null ? `${currentElevationM} m` : "—"}
              </dd>
            </div>
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
          {/* Wie bei der freien Fahrt: rot nur, wenn das Speichern daran
              scheitert. Eine mutmassliche Bahnfahrt fragt bloss nach. */}
          {bewegungswarnung && (
            <p
              role="status"
              className={`text-sm ${bewegungswarnung.blockiert ? "text-danger" : "text-muted"}`}
            >
              {bewegungswarnung.text}
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
          {/* Der Wachhinweis stand als 12-px-Fussnote RECHTS NEBEN dem
              Beenden-Knopf — also in der kleinsten Schrift der App, direkt
              neben der grössten Schaltfläche, auf dem Schirm, der in
              Bewegung gelesen wird. Wer ihn übersieht, verliert die halbe
              Aufzeichnung, weil der Browser das GPS pausiert.

              Jetzt eine eigene Zeile über den Schaltflächen, in 14 px und
              mit Symbol. Er steht vor dem Beenden und nicht daneben, damit
              er nicht mit der Handlung konkurriert.
              docs/audit/uiux.md §5.4. */}
          <p className="flex items-start gap-2 text-sm leading-snug text-muted">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>Bildschirm an lassen — sonst pausiert die Aufzeichnung.</span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {recorder.hasStarted ? (
              // Halten statt Tippen, wie bei der freien Fahrt (HalteKnopf
              // begründet es). Hier zählt es doppelt: am Ziel beendet sich
              // die Fahrt ohnehin selbst, ein Knopfdruck von Hand ist also
              // fast immer der Sonderfall — und ein versehentlicher kostet
              // die Bestzeit.
              <>
                <button
                  type="button"
                  onClick={recorder.pausiert ? recorder.weiterNachPause : recorder.pausieren}
                  className={buttonVariants({
                    variant: recorder.pausiert ? "accent" : "secondary",
                    size: "lg",
                    className: "shrink-0 px-6",
                  })}
                >
                  {recorder.pausiert ? "Weiter" : "Pause"}
                </button>
                <HalteKnopf onBestaetigt={recorder.stop} className="flex-1">
                  Zum Beenden halten
                </HalteKnopf>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleExit}
                  className={buttonVariants({ variant: "secondary", size: "lg", className: "flex-1" })}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={recorder.beginNow}
                  className={textAktionClassName()}
                >
                  Bin schon am Start
                </button>
              </>
            )}
          </div>
        </div>
      </FullscreenDialog>
    );
  }

  // phase === "finished" — Fazit als eigener Vollbild-Screen, keine
  // Streckendetails/Karte mehr im Blick.
  const isNewBest =
    result !== null && (personalBestSeconds === null || result.seconds < personalBestSeconds);

  // Ohne pb-[var(--safe-bottom)], anders als die Ansichten davor:
  // diese hier endet auf dem klebenden Speichern-Streifen aus
  // RideSummaryForm, und der bringt den sicheren Bereich in seiner
  // EIGENEN Polsterung mit. Beides zusammen ergab, sobald man ganz
  // nach unten gescrollt hatte, zwei Höhen des Home-Indikators unter
  // dem Knopf. Der Streifen deckt die untere Kante ohnehin immer ab,
  // also gehört der Zuschlag dorthin und nicht hierher.
  return (
    <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 overflow-y-auto bg-background pt-[var(--safe-top)]">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 py-8 sm:px-6 sm:py-10">
        <FazitKopf
            titel={"Strecke gefahren"}
            trail={recorder.liveTrail}
            distanzKm={result?.distanceKm ?? 0}
            sekunden={result?.seconds ?? 0}
          />

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
          <div className="flex flex-col gap-3">
            {/* Vorher fünf Zeilen grauer Text in einer Karte und "Konto erstellen"
                als 36-px-Knopf — kleiner als die beiden Textlinks darunter. Die
                Handlung, um die es hier geht, stand optisch an dritter Stelle.
                Jetzt ein Satz, der eine Knopf in voller Breite und Grösse, und die
                Nebenwege leise darunter. Der Hinweis auf die 24 Stunden bleibt: er
                ist der Grund, sich nicht zu beeilen. */}
            <p className="text-sm text-muted">
              Speichern mit Konto: dann zählt die Fahrt für deine Bestzeit auf dieser Strecke, die Ranglisten und dein Profil. Sie wartet bis zu 24 Stunden in diesem Browser.
            </p>
            <button
              type="button"
              onClick={() => goToAuth("/registrieren")}
              className={buttonVariants({ variant: "accent", size: "lg", className: "w-full" })}
            >
              Konto erstellen und speichern
            </button>
            <button
              type="button"
              onClick={() => goToAuth("/anmelden")}
              className={buttonVariants({ variant: "secondary", className: "w-full" })}
            >
              Ich habe ein Konto
            </button>
            <button
              type="button"
              onClick={recorder.fortsetzen}
              className={buttonVariants({ variant: "secondary", className: "w-full" })}
            >
              Weiter aufzeichnen
            </button>
            {/* Verwerfen leise und allein, in der Gefahrenfarbe beim Berühren —
                nicht in einer Reihe mit dem Weg zurück in die Fahrt. */}
            <button
              type="button"
              onClick={() => setGastVerwerfenOffen(true)}
              className="mt-1 min-h-11 self-center text-sm text-muted transition-colors duration-fast hover:text-danger"
            >
              Fahrt verwerfen
            </button>
          </div>
          <ConfirmDialog
            open={gastVerwerfenOffen}
            title="Fahrt verwerfen?"
            description="Die aufgezeichnete Fahrt wurde noch nicht gespeichert und geht dabei endgültig verloren."
            confirmLabel="Verwerfen"
            variant="danger"
            onConfirm={handleDiscard}
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
              ticketJson={recorder.ticketJson}
            isPublic={isPublic}
            onIsPublicChange={setIsPublic}
            onSubmit={() => setSubmitted(true)}
            onDiscard={handleDiscard}
            onResume={recorder.fortsetzen}
            visibility={{
              publicDisabled: belowCoverageThreshold,
              // Seit 0078 ist der Deckungsgrad das Minimum aus "berührt" und
              // "zurückgelegte Länge". Der dritte Grund im Text ist der neue:
              // bei einer Strecke, die über dieselbe Strasse zurückführt, kann
              // alles berührt und trotzdem nur die Hälfte gefahren sein.
              publicDisabledHint: `Diese Fahrt deckt nur ${coveragePercent}% der offiziellen Strecke ab — evtl. abgekürzt, am falschen Punkt gestartet/beendet, oder die Strecke führt zurück und du bist nur eine Richtung gefahren. Sie bleibt privat gespeichert, kann aber nicht öffentlich geteilt werden.`,
              publicHint:
                "Öffentlich: erscheint in den Ranglisten und auf deinem öffentlichen Profil. Später jederzeit umschaltbar.",
              privateHint:
                "Privat: nur du siehst diese Fahrt in deinem Profil, für andere bleibt sie unsichtbar. Später jederzeit umschaltbar.",
            }}
          />
        )}
      </div>
    </FullscreenDialog>
  );
}
