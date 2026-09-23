"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Route as RouteIcon, Smartphone } from "lucide-react";
import { logFreeRide, type FreeRideFormState } from "@/lib/actions/completions";
import { useRideRecorder } from "@/components/useRideRecorder";
import { useLiveLapHint } from "@/components/useLiveLapHint";
import { useBewegungswarnung } from "@/components/useBewegungswarnung";
import {
  FREE_RIDE_STORAGE_KEY,
  GUEST_TRACKING_USER_ID,
  issueGuestContinuationToken,
} from "@/lib/trackingStorage";
import RideSummaryForm, { FAZIT_ABSCHNITT } from "@/components/RideSummaryForm";
import { formatDuration } from "@/lib/format";
import { computeSignatures } from "@/lib/signature";
import { movingSeconds, publicationBlockReason } from "@/lib/track";
import { bewerteBewegungsprofil } from "@/lib/bewegungsprofil";
import type { ExploreRoute, Vehicle } from "@/types/database";
import { fieldClassName } from "@/components/ui/Input";
import { buttonVariants } from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import FullscreenDialog from "@/components/ui/FullscreenDialog";
import SectionHeading from "@/components/ui/SectionHeading";
import HalteKnopf from "@/components/ui/HalteKnopf";
import FazitKopf from "@/components/FazitKopf";
import { merkeHinweis } from "@/components/Hinweis";

// Siehe ExploreView.tsx für die Begründung des dynamischen Imports.
//
// Das catch ist für den Start ohne Empfang: der Service Worker hält diese
// Seite vorgeladen bereit (public/sw.js), die nachgeladene Karte aber bewusst
// nicht (1,8 MB, offline ohne Kacheln ohnehin leer). Ohne catch landete der
// gescheiterte Chunk-Abruf in der Fehlergrenze und risse die ganze
// Aufzeichnung mit — so fehlt nur die Karte.
const RouteMap = dynamic(
  () =>
    import("@/components/RouteMap").catch(() => ({
      default: KarteOhneVerbindung as (typeof import("@/components/RouteMap"))["default"],
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full" />,
  },
);

function KarteOhneVerbindung() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface p-6 text-center text-sm text-muted">
      Ohne Verbindung keine Karte. Die Aufzeichnung läuft trotzdem.
    </div>
  );
}

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
    // Der Einstieg ist die Mitte der Navigationsleiste — ein Fehlgriff dort
    // darf keine Fahrt beginnen. Siehe autoStart in useRideRecorder.ts.
    autoStart: false,
  });
  const { phase, result, clearSnapshot, discard } = recorder;

  // Dieselben Signaturfarben wie auf der Startseite (ExploreView.tsx), damit
  // die Karte gleich aussieht: gleiche Töne in Liste und Linie, aus denselben
  // Tokens. Eigener useMemo für eine stabile Prop-Referenz an RouteMap.
  const kartenSignaturen = useMemo(() => {
    const signatures = computeSignatures(routes);
    return new Map([...signatures].map(([id, sig]) => [id, sig.key]));
  }, [routes]);

  // Standort schon auf dem Startbildschirm (/fahrten/neu) holen, nicht erst
  // mit dem Start: Die Karte zentriert einmalig darauf (centerOnFirstLocation
  // unten) und zeigt den Marker — derselbe Mechanismus wie während der Fahrt,
  // nur dass dort der Recorder übernimmt. Einmalig per getCurrentPosition wie
  // in ExploreView; ein Fehlschlag bleibt hier stumm, der Startversuch meldet
  // ihn ohnehin über recorder.locationError.
  const [standort, setStandort] = useState<[number, number] | null>(null);
  const [standortGenauigkeitM, setStandortGenauigkeitM] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== "idle" || standort !== null) return;
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStandort([pos.coords.longitude, pos.coords.latitude]);
        setStandortGenauigkeitM(pos.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [phase, standort]);

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
  // VOREINGESTELLT ÖFFENTLICH, Entscheid des Inhabers vom 2026-09-17. Bis
  // dahin stand hier false, und die Datenschutzerklärung sowie AGB
  // Ziff. 10.1.1 sagten "Fahrten sind standardmässig privat". Beide Texte
  // sind im selben PR als Entwurf geändert (docs/rechtstexte/) — dieser
  // Code darf erst ausgeliefert werden, wenn die geänderten Fassungen in
  // Kraft sind (AGB Ziff. 14.1: 30 Tage Vorankündigung).
  //
  // Eine Fahrt, die die Veröffentlichung nicht erfüllt, bleibt trotzdem
  // privat: der Wert unten wird mit der Sperre verrechnet, und der Server
  // kann ist_oeffentlich ohnehin nur verengen (0052).
  const [isPublic, setIsPublic] = useState(true);
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

  // Verwerfen einer aufgezeichneten Fahrt endete bisher kommentarlos auf der
  // Startseite. Die Quittung reist über den Seitenwechsel mit (Hinweis.tsx).
  // "Abbrechen" vor dem Start bleibt ohne: da gab es nichts zu verlieren.
  function handleDiscard() {
    merkeHinweis("Fahrt verworfen.");
    handleExit();
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
            titel={"Fahrt beendet"}
            trail={recorder.liveTrail}
            distanzKm={result?.distanceKm ?? 0}
            sekunden={result?.seconds ?? 0}
          />

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
            <div className="flex flex-col gap-3">
              {/* Vorher fünf Zeilen grauer Text in einer Karte und "Konto erstellen"
                  als 36-px-Knopf — kleiner als die beiden Textlinks darunter. Die
                  Handlung, um die es hier geht, stand optisch an dritter Stelle.
                  Jetzt ein Satz, der eine Knopf in voller Breite und Grösse, und die
                  Nebenwege leise darunter. Der Hinweis auf die 24 Stunden bleibt: er
                  ist der Grund, sich nicht zu beeilen. */}
              <p className="text-sm text-muted">
                Speichern mit Konto: dann landet die Fahrt in deinem Profil, zählt für die Ranglisten und lässt sich teilen. Sie wartet bis zu 24 Stunden in diesem Browser.
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
              ticketJson={recorder.ticketJson}
              visibility={{
                publicDisabled: publicationBlocked !== null,
                publicDisabledHint: publicationBlocked ?? undefined,
                publicHint:
                  "Öffentlich: erscheint im Feed und auf deinem öffentlichen Profil. Start und Ziel werden auf der Karte gekappt (Privatzone in den Einstellungen). Später jederzeit umschaltbar.",
                privateHint:
                  "Privat: nur du siehst diese Fahrt in deinem Profil, für andere bleibt sie unsichtbar. Später jederzeit umschaltbar.",
              }}
              isPublic={isPublic && publicationBlocked === null}
              onIsPublicChange={setIsPublic}
              onSubmit={() => setSubmitted(true)}
              onDiscard={handleDiscard}
              onResume={recorder.fortsetzen}
            >
              {/* Dieselbe Abschnittsgeometrie wie die Abschnitte im Fazit
                  selbst — dieser hier wird nur von aussen eingehängt, ist
                  aber keiner anderen Art. Siehe FAZIT_ABSCHNITT. */}
              <div className={FAZIT_ABSCHNITT}>
                <div className="flex items-baseline justify-between">
                  <SectionHeading as="label" groesse="xs" htmlFor="freie-fahrt-titel">
                    Titel (optional)
                  </SectionHeading>
                  <span className="text-xs tabular-nums text-muted">
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
                  placeholder="z.B. Sonntagsrunde Klausenpass"
                  className={fieldClassName()}
                />
              </div>
            </RideSummaryForm>
          )}
        </div>
      </FullscreenDialog>
    );
  }

  // Vor dem Start: der Recorder wartet auf ein ausdrückliches Tippen
  // (autoStart: false). Dieselbe Karte wie während der Fahrt, damit der
  // Wechsel in die Aufzeichnung kein Sprung ist — nur das Panel darunter
  // sagt, was gleich passiert, und trägt die eine Handlung.
  if (phase === "idle") {
    return (
      // Scroll-Notausgang wie im Tracking-Dialog darunter: Titel, Hinweise,
      // Fehler und Knöpfe stapeln sich auf kurzen Schirmen über die Höhe.
      <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background">
        <div className="flex-1 min-h-[30dvh]">
          <RouteMap
            routes={routes}
            signaturen={kartenSignaturen}
            umlandSchleier
            fitRoutes={false}
            routesClickable={false}
            userLocation={standort}
            userAccuracyM={standortGenauigkeitM}
            centerOnFirstLocation
          />
        </div>
        <div className="md:mx-auto md:w-full md:max-w-lg md:rounded-t-lg md:border-x flex shrink-0 flex-col gap-4 border-t border-border bg-background px-5 pt-5 pb-[calc(1.25rem+var(--safe-bottom))]">
          <div className="flex flex-col gap-1">
            <h1 className="text-title font-semibold tracking-tight">Freie Fahrt</h1>
            <p className="text-sm text-muted">
              Ohne Strecke, einfach losfahren. Gemessen wird ab dem ersten GPS-Signal nach dem
              Start — beendet wird die Fahrt von dir.
            </p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex items-start gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span>Bildschirm an lassen — sonst pausiert die Aufzeichnung.</span>
            </li>
            {istGast && (
              <li className="text-muted">
                Ohne Konto: aufzeichnen geht, zum Speichern brauchst du am Ende eine Anmeldung.
              </li>
            )}
          </ul>
          {/* gap-2 statt gap-1: zwischen dem Start- und dem Abbrechen-Knopf
              lagen 4 px. Das ist das einzige Knopfpaar der App, bei dem ein
              Fehlgriff etwas kostet — wer starten will und abbricht, steht
              wieder am Anfang, mit Helm und Handschuhen. */}
          {/* Scheitert der Start (kein Geolocation im Browser, Standort
              verweigert), blieb dieser Schirm bisher stumm: der Knopf tat
              nichts und sagte nichts. */}
          {recorder.locationError && (
            <p role="alert" className="text-sm text-danger">
              {recorder.locationError}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={recorder.starten}
              className={buttonVariants({ variant: "accent", size: "lg", className: "w-full" })}
            >
              Aufzeichnung starten
            </button>
            <button
              type="button"
              onClick={handleExit}
              className="min-h-11 text-sm text-muted transition-colors duration-fast hover:text-foreground"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </FullscreenDialog>
    );
  }

  // Während der Fahrt. Die Watch läuft, die Messung beginnt mit dem ersten
  // brauchbaren Fix (hasStarted). Scroll-Notausgang und Kartenmindesthöhe
  // wie im Strecken-Tracking (LiveTrackingForm.tsx): Das Panel darf die
  // Knöpfe nie aus dem Bild drücken.
  return (
    <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background">
      <div className="flex-1 min-h-[30dvh]">
        <RouteMap
          routes={routes}
          signaturen={kartenSignaturen}
          umlandSchleier
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
      <div className="md:mx-auto md:w-full md:max-w-lg md:rounded-t-lg md:border-x flex shrink-0 flex-col gap-4 border-t border-border bg-background px-5 pt-4 pb-[calc(1rem+var(--safe-bottom))]">
        {/* Statuszeile in Satzschreibung statt versal in Mono: sie ist ein
            Zustand, kein Etikett. Der rote Punkt bleibt das Signal, dass
            wirklich aufgezeichnet wird. */}
        <div className="flex items-center justify-between gap-3">
          {/* role="status": Start, Pause und das automatische Loslaufen der
                Zeit am Startpunkt werden angesagt — wer fährt, schaut nicht
                hin. Nur diese Zeile, nicht die Uhr daneben: die würde jede
                Sekunde vorgelesen. */}
            <p role="status" className="flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${recorder.hasStarted && !recorder.pausiert ? "bg-danger" : "bg-muted"}`}
            />
            {recorder.pausiert ? "Pausiert" : recorder.hasStarted ? "Aufzeichnung läuft" : "Warte auf GPS…"}
          </p>
          <p className="text-sm text-muted tabular-nums">
            <span className="sr-only">Zeit </span>
            {formatDuration(recorder.elapsedSeconds)}
          </p>
        </div>
        {/* DER SCHIRM, DER IN BEWEGUNG GELESEN WIRD — und bis hierher war
            seine grösste Zahl die Uhr (36 px), während Tempo und Distanz als
            eine 15-px-Zeile in Grau darunter standen. Bei einer freien Fahrt
            gibt es keine Bestenliste, gegen die die Zeit zählt: der Blick
            aufs Telefon in der Halterung sucht das Tempo und wie weit man
            ist. Also tragen diese beiden die Fläche, in voller
            Vordergrundfarbe, und die Uhr rückt in die Statuszeile.

            Inter mit tabellarischen Ziffern statt Mono: die Ziffern springen
            nicht, und die Zahl liest sich als Zahl, nicht als Code. */}
        <dl className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted">Tempo</dt>
            <dd className="text-5xl leading-none font-semibold tracking-tight tabular-nums">
              {recorder.speedKmh !== null ? recorder.speedKmh.toFixed(0) : "—"}
              <span className="ml-1.5 text-base font-medium tracking-normal text-muted">km/h</span>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted">Distanz</dt>
            <dd className="text-5xl leading-none font-semibold tracking-tight tabular-nums">
              {recorder.distanceKm.toFixed(1)}
              <span className="ml-1.5 text-base font-medium tracking-normal text-muted">km</span>
            </dd>
          </div>
        </dl>
        {/* Reiner Komfort-Hinweis, keine Wertung — die tatsächlich erkannten
            Streckenabschnitte entscheidet ausschliesslich der Server beim
            Speichern (siehe useLiveLapHint.ts). */}
        {/* Angesagt wird nur das Erkannt, nicht der laufende Prozentwert —
            der änderte sich mit jedem Fix. Die Region steht immer im DOM,
            damit ein Vorleser den Wechsel auf "erkannt" überhaupt bemerkt. */}
        <p role="status" className="sr-only">
          {liveLapHint?.completed ? `Strecke ${liveLapHint.routeName} erkannt.` : ""}
        </p>
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
        {/* Der Wachhinweis vor der Handlung statt als Fussnote daneben —
            siehe LiveTrackingForm.tsx und docs/audit/uiux.md §5.4. Ohne
            Kasten: eine Zeile mit Symbol reicht, der Rahmen darum war eine
            weitere Fläche auf einem Schirm, der zwei Zahlen tragen soll. */}
        <p className="flex items-start gap-2 text-sm leading-snug text-muted">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>Bildschirm an lassen — sonst pausiert die Aufzeichnung.</span>
        </p>
        {recorder.hasStarted ? (
          // Pause neben dem Beenden: ein Tankstopp oder ein Aussichtspunkt
          // ist keine neue Fahrt. Pause ist harmlos und umkehrbar, deshalb
          // ein gewöhnlicher Knopf; Beenden bleibt die Halte-Geste.
          <div className="flex gap-3">
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
          </div>
        ) : (
          <button
            type="button"
            onClick={handleExit}
            className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}
          >
            Abbrechen
          </button>
        )}
      </div>
    </FullscreenDialog>
  );
}
