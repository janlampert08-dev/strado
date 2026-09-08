"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Route as RouteIcon } from "lucide-react";
import { logFreeRide, type FreeRideFormState } from "@/lib/actions/completions";
import { useRideRecorder } from "@/components/useRideRecorder";
import { useLiveLapHint } from "@/components/useLiveLapHint";
import { useBewegungswarnung } from "@/components/useBewegungswarnung";
import {
  FREE_RIDE_STORAGE_KEY,
  GUEST_TRACKING_USER_ID,
  issueGuestContinuationToken,
} from "@/lib/trackingStorage";
import RideSummaryForm from "@/components/RideSummaryForm";
import { formatDuration } from "@/lib/format";
import { movingSeconds, publicationBlockReason } from "@/lib/track";
import { bewerteBewegungsprofil } from "@/lib/bewegungsprofil";
import type { ExploreRoute, Vehicle } from "@/types/database";
import { fieldClassName } from "@/components/ui/Input";
import { buttonVariants } from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import FullscreenDialog from "@/components/ui/FullscreenDialog";

// Siehe ExploreView.tsx für die Begründung des dynamischen Imports.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const initialState: FreeRideFormState = { error: null };
const MAX_TITEL_LENGTH = 80;


// Aufzeichnung einer freien Fahrt: kein Streckenbezug, also kein
// automatischer Start am Startpunkt, kein automatischer Stopp am Ziel und
// kein Deckungsgrad. Gestartet wird mit dem ersten GPS-Fix, beendet von
// Hand. GPS-Mechanik (useRideRecorder) und Fazit-Formular
// (RideSummaryForm) teilt sich diese Ansicht mit LiveTrackingForm.
export default function FreeRideForm({
  userId,
  vehicles,
  routes,
  guestContinuationToken = null,
  maxPhotos,
}: {
  // Nur für den localStorage-Schlüssel der Wiederherstellung — die Fahrt
  // selbst wird serverseitig dem angemeldeten Nutzer zugeordnet.
  //
  // null heisst: abgemeldeter Besucher. Aufzeichnen geht trotzdem, nur das
  // Speichern am Ende verlangt ein Konto (Gate im Fazit weiter unten). Der
  // Snapshot läuft dann unter GUEST_TRACKING_USER_ID.
  userId: string | null;
  vehicles: Vehicle[];
  // Freigegebene Strecken als Orientierungshilfe auf der Karte: sichtbar,
  // aber weder anklickbar noch massgeblich für den Kartenausschnitt (die
  // Karte folgt der GPS-Position). Ein Streckenbezug entsteht daraus nicht —
  // eine freie Fahrt bleibt eine freie Fahrt, auch wenn sie zufällig über
  // eine kuratierte Strecke führt.
  routes: ExploreRoute[];
  // Der Marker aus ?fortsetzen=<token>, mit dem sich die Rückkehr aus dem
  // Anmelde-Gate ausweist — nur damit darf die als Gast aufgezeichnete Fahrt
  // an dieses Konto übergehen (siehe adoptGuestTrackingSnapshot).
  guestContinuationToken?: string | null;
  /** Fotos pro Fahrt, aus dem Abo-Zustand (lib/premium.ts). */
  maxPhotos: number;
}) {
  const router = useRouter();
  const istGast = userId === null;
  const [state, formAction, pending] = useActionState(logFreeRide, initialState);
  const recorder = useRideRecorder({
    userId: userId ?? GUEST_TRACKING_USER_ID,
    storageKey: FREE_RIDE_STORAGE_KEY,
    guestContinuationToken,
  });
  const { phase, result, clearSnapshot, discard } = recorder;

  // Rein informativer Live-Hinweis während der Fahrt — siehe
  // components/useLiveLapHint.ts. Massgeblich für die tatsächlich erkannten
  // Streckenabschnitte bleibt ausschliesslich die serverseitige Erkennung
  // beim Speichern (logFreeRide).
  const liveLapHint = useLiveLapHint(phase === "tracking", recorder.liveTrailPoints, routes);

  // Früher Hinweis während der Fahrt und die abschliessende Beurteilung des
  // fertigen Trails im Fazit. Massgeblich ist beides nicht: abgelehnt wird
  // serverseitig in logFreeRide, und auch dort nur ein Flug — das
  // Bahn-Verdikt fragt bloss nach (siehe lib/bewegungsprofil.ts).
  const bewegungswarnung = useBewegungswarnung(phase === "tracking", recorder.liveTrailPoints);
  const bewegungsbefund = useMemo(() => {
    if (phase !== "finished") return null;
    const profil = bewerteBewegungsprofil(recorder.finishedTrail);
    if (!profil.begruendung) return null;
    return { blockiert: profil.blockiert, text: profil.begruendung };
  }, [phase, recorder.finishedTrail]);

  const [titel, setTitel] = useState("");
  // Dieselbe Rückfrage wie im angemeldeten Pfad (RideSummaryForm).
  // Vorher verwarf ein einzelner Tap hier eine bereits FERTIGE
  // Aufzeichnung sofort und endgültig — ausgerechnet im Gast-Fall,
  // wo serverseitig noch nichts liegt und der lokale Snapshot die
  // einzige Kopie der Fahrt ist.
  const [gastVerwerfenOffen, setGastVerwerfenOffen] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Hält die automatische Weiterleitung an, solange es noch etwas
  // Informatives zu zeigen gibt (siehe partialAttempts unten) — im
  // ganz überwiegenden Fall (keine oder nur volle Runden erkannt) bleibt
  // dieser Zustand ungenutzt und die Weiterleitung passiert wie bisher
  // sofort.
  const [partialAcknowledged, setPartialAcknowledged] = useState(false);

  // Dieselbe Prüfung wie im Server (logFreeRide): eine zu kurze Aufzeichnung
  // lässt sich speichern, aber nicht teilen. Die Bewegtzeit wird hier aus
  // demselben Trail berechnet, den das Formular ohnehin mitschickt — der
  // Server rechnet sie unabhängig noch einmal nach.
  const publicationBlocked = useMemo(() => {
    if (!result) return null;
    return publicationBlockReason(result.distanceKm, movingSeconds(recorder.finishedTrail));
  }, [result, recorder.finishedTrail]);

  // Nach dem Speichern direkt auf die neue Fahrt — anders als bei einer
  // Streckenfahrt gibt es keine Seite, zu der man "zurück" könnte. Gibt es
  // ausserdem einen "fast geschafft"-Hinweis (partialAttempts), wartet die
  // Weiterleitung, bis der Nutzer ihn gesehen und bestätigt hat — dafür
  // gibt es sonst keine Seite, auf der er später noch auftauchen könnte
  // (nicht gespeichert, siehe lib/actions/completions.ts).
  const hasUnacknowledgedPartial = (state.partialAttempts?.length ?? 0) > 0 && !partialAcknowledged;
  useEffect(() => {
    if (submitted && !pending && !state.error && state.completionId && !hasUnacknowledgedPartial) {
      clearSnapshot();
      router.push(`/fahrten/${state.completionId}`);
    }
  }, [
    submitted,
    pending,
    state.error,
    state.completionId,
    hasUnacknowledgedPartial,
    clearSnapshot,
    router,
  ]);

  function handleExit() {
    discard();
    router.push("/");
  }

  // Stellt den einmalig einlösbaren Marker genau im Moment des Gate-Klicks
  // aus (statt beim Rendern) und hängt ihn ans Rücksprungziel: nur wer hier
  // durchgegangen ist, kann die Gastfahrt nach der Anmeldung übernehmen.
  // Bleibt der Marker aus (localStorage nicht schreibbar), führt der Weg
  // trotzdem zur Anmeldung — dann existiert aus demselben Grund aber ohnehin
  // kein Snapshot, der zu übernehmen wäre.
  function goToAuth(ziel: "/anmelden" | "/registrieren") {
    const token = issueGuestContinuationToken(FREE_RIDE_STORAGE_KEY);
    const zurueck = token
      ? `/fahrten/neu?fortsetzen=${encodeURIComponent(token)}`
      : "/fahrten/neu";
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
            {/* Nicht router.push("/fahrten/neu"): Dieser Bildschirm liegt
                selbst auf /fahrten/neu, nur mit einem ?fortsetzen=-Marker in
                der URL. Eine Client-Navigation auf dieselbe Route hängt die
                Komponente nicht aus — uebernahmeGescheitert bliebe stehen
                und der Knopf zeigte wieder genau diesen Bildschirm.
                Stattdessen das Flag zurücksetzen (der Recorder steht ohnehin
                auf "idle", die Übernahme ist vor jedem Start abgebrochen)
                und den verbrauchten Marker per replace aus der URL nehmen,
                damit ein Neuladen nicht wieder hier landet. */}
            <button
              type="button"
              onClick={() => {
                recorder.uebernahmeFehlerVerwerfen();
                router.replace("/fahrten/neu");
              }}
              className={buttonVariants({ variant: "accent", size: "sm", className: "self-start" })}
            >
              Neue Fahrt aufzeichnen
            </button>
          </Card>
        </div>
      </FullscreenDialog>
    );
  }

  if (phase === "finished") {
    const avgKmh =
      result && result.seconds > 0 ? result.distanceKm / (result.seconds / 3600) : null;

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
              <dd className="font-mono text-lg tabular-nums">
                {formatDuration(result?.seconds ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Ø Tempo</dt>
              <dd className="font-mono text-lg tabular-nums">
                {avgKmh !== null ? `${avgKmh.toFixed(0)} km/h` : "—"}
              </dd>
            </div>
          </dl>

          {/* Zwei Fälle in einer Karte: was der Server ohnehin ablehnt
              (Flug), steht hier schon mit Begründung, damit nicht nur "ging
              nicht" übrig bleibt — und der Grenzfall (Bahn), der bewusst
              nur fragt und das Speichern nicht anrührt. Das Formular bleibt
              in beiden Fällen bedienbar: entschieden wird auf dem Server,
              nicht in dieser Anzeige. */}
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

          {/* Das Anmelde-Gate des Kernloops: aufzeichnen darf jeder, ein
              Konto braucht erst das Speichern. Bewusst hier und nicht schon
              beim Öffnen des Recorders — wer die Fahrt hinter sich hat und
              sein Ergebnis vor sich sieht, hat einen Grund für ein Konto.
              Die Aufzeichnung liegt bis dahin unter dem Gast-Schlüssel im
              Browser und wird nach der Anmeldung übernommen
              (adoptGuestTrackingSnapshot), geht hier also nicht verloren.
              Serverseitig ändert das nichts: logFreeRide weist eine Fahrt
              ohne Session unabhängig davon ab. */}
          {istGast ? (
          <>
            <Card surface className="flex flex-col gap-3 p-4 text-sm">
              <p className="font-medium text-foreground">Fahrt aufgezeichnet.</p>
              <p className="text-muted">
                Zum Speichern brauchst du ein Konto — damit landet die Fahrt in deinem Profil,
                zählt für die Bestenlisten und kann im Feed geteilt werden. Die Aufzeichnung
                bleibt so lange in diesem Browser (bis zu 24 Stunden) und wird nach der
                Anmeldung übernommen.
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
          ) : // Erst nach erfolgreichem Speichern relevant, siehe
            // hasUnacknowledgedPartial oben: hält kurz an, bevor es wie
            // gewohnt auf die neue Fahrt weitergeht — es gibt sonst keine
            // Seite, auf der dieser Hinweis später noch stehen könnte
            // (partialAttempts wird nicht gespeichert).
            state.completionId && hasUnacknowledgedPartial ? (
            <Card surface className="flex flex-col gap-3 p-4 text-sm">
              <p className="font-medium text-foreground">Fahrt gespeichert.</p>
              {state.partialAttempts!.map((p) => (
                <p key={p.routeId} className="text-muted">
                  „{p.routeName}&#8220; wurde zu {p.percent}% gefahren — nicht vollständig, zählt nicht
                  als eigene Fahrt.
                </p>
              ))}
              <button
                type="button"
                onClick={() => setPartialAcknowledged(true)}
                className={buttonVariants({ variant: "accent", size: "sm" })}
              >
                Weiter
              </button>
            </Card>
          ) : (
            <RideSummaryForm
              maxPhotos={maxPhotos}
              formAction={formAction}
              pending={pending}
              error={state.error}
              vehicles={vehicles}
              trailJson={recorder.trailJson}
              visibility={{
                publicDisabled: publicationBlocked !== null,
                publicDisabledHint: publicationBlocked ?? undefined,
                publicHint:
                  "Öffentlich: erscheint im Feed und auf deinem öffentlichen Profil. Start und Ziel werden auf der Karte gekappt (Privatzone in den Einstellungen). Später jederzeit umschaltbar.",
                privateHint:
                  "Privat: nur du siehst diese Fahrt in deinem Profil, für andere bleibt sie unsichtbar. Später jederzeit umschaltbar.",
              }}
              isPublic={isPublic}
              onIsPublicChange={setIsPublic}
              onSubmit={() => setSubmitted(true)}
              onDiscard={handleExit}
            >
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="freie-fahrt-titel"
                    className="text-xs font-semibold tracking-wide text-muted uppercase"
                  >
                    Titel (optional)
                  </label>
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {titel.length}/{MAX_TITEL_LENGTH}
                  </span>
                </div>
                <input
                  id="freie-fahrt-titel"
                  name="titel"
                  type="text"
                  maxLength={MAX_TITEL_LENGTH}
                  value={titel}
                  onChange={(e) => setTitel(e.target.value)}
                  placeholder="z.B. Sonntagsrunde Zürichsee"
                  className={fieldClassName()}
                />
              </div>
            </RideSummaryForm>
          )}
        </div>
      </FullscreenDialog>
    );
  }

  // phase "idle" und "tracking" teilen sich denselben Vollbild-Screen: die
  // Aufzeichnung läuft ab dem ersten Fix, bis dahin steht nur die Karte da.
  return (
    <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="min-h-0 flex-1">
        <RouteMap
          routes={routes}
          fitRoutes={false}
          routesClickable={false}
          trail={recorder.liveTrail}
          centerOnFirstLocation
          followLocation
          userLocation={recorder.position}
          userAccuracyM={recorder.accuracyM}
          userHeadingDeg={recorder.headingDeg}
        />
      </div>
      <div className="flex flex-col gap-3 border-t border-border-strong bg-background p-4 pb-[calc(1rem+var(--safe-bottom))]">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          {recorder.hasStarted ? "Aufzeichnung läuft" : "Warte auf GPS"}
        </p>
        {/* Vorwarnung statt einer Überraschung am Ende: das Konto wird erst
            beim Speichern verlangt, aber wer ohne eines losfährt, soll das
            vor der Fahrt wissen und nicht erst im Fazit. */}
        {istGast && (
          <p className="text-xs text-muted">
            Ohne Konto: aufzeichnen geht, zum Speichern der Fahrt brauchst du am Ende eine
            Anmeldung.
          </p>
        )}
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-muted">Distanz</dt>
            <dd className="font-mono text-xl tabular-nums">{recorder.distanceKm.toFixed(2)} km</dd>
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
        </dl>
        {/* Reiner Komfort-Hinweis, keine Wertung — die tatsächlich erkannten
            Streckenabschnitte entscheidet ausschliesslich der Server beim
            Speichern (siehe useLiveLapHint.ts). */}
        {liveLapHint && (
          <p className="flex items-center gap-1.5 text-sm text-accent">
            <RouteIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {liveLapHint.completed
              ? `„${liveLapHint.routeName}" erkannt!`
              : `„${liveLapHint.routeName}" wird erkannt · ${Math.round(liveLapHint.fraction * 100)}%`}
          </p>
        )}
        {/* Zug oder Flug erkannt. Der Ton hängt an der Folge: ein Flug
            lässt sich am Ende nicht speichern (rot), eine mutmassliche
            Bahnfahrt schon — die fragt nur nach und darf deshalb nicht wie
            ein Fehler aussehen. */}
        {bewegungswarnung && (
          <p
            role="status"
            className={`text-sm ${bewegungswarnung.blockiert ? "text-danger" : "text-muted"}`}
          >
            {bewegungswarnung.text}
          </p>
        )}
        {recorder.locationError && <p role="alert" className="text-sm text-danger">{recorder.locationError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {recorder.hasStarted ? (
            <button
              type="button"
              onClick={recorder.stop}
              className={buttonVariants({ variant: "accent", size: "lg" })}
            >
              Fahrt beenden
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExit}
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Abbrechen
            </button>
          )}
          <p className="text-xs text-muted">
            Bildschirm eingeschaltet lassen — GPS-Tracking im Browser pausiert sonst.
          </p>
        </div>
      </div>
    </FullscreenDialog>
  );
}
