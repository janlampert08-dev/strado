"use client";

import KartePlatzhalter from "@/components/ui/KartePlatzhalter";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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
import { haversineKm } from "@/lib/geo";
import { distanzZumNaechstenPunktKm } from "@/lib/tracking";
import { interpolateElevation } from "@/lib/elevation";
import { computeRouteCoverage, COVERAGE_THRESHOLD_PERCENT } from "@/lib/routeCoverage";
import { bewerteBewegungsprofil } from "@/lib/bewegungsprofil";
import { formatDauer, formatDuration } from "@/lib/format";
import { formatAbstand, liveAbstandSekunden, markeUeberschritten } from "@/lib/liveSplit";
import RideSummaryForm from "@/components/RideSummaryForm";
import type { KartenStrecke, RouteGeoJSON, Vehicle } from "@/types/database";
import { Smartphone } from "@/components/NavIcons";
import { buttonVariants } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import FullscreenDialog from "@/components/ui/FullscreenDialog";
import HalteKnopf from "@/components/ui/HalteKnopf";
import FazitKopf from "@/components/FazitKopf";
import { zeigeHinweis } from "@/components/Hinweis";
import GpsBereitschaft from "@/components/GpsBereitschaft";
import { useVolleGeometrie } from "@/components/VolleGeometrie";
import { useGeraet, useStandortFreigabe } from "@/components/useStandortFreigabe";
import { standortAnleitung } from "@/lib/geraet";
import { streckenPfad } from "@/lib/streckenPfad";

// Siehe ExploreView.tsx für die Begründung des dynamischen Imports.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <KartePlatzhalter />,
});

const initialState: CompletionFormState = { error: null };

// Kurzdistanz für die Abstandsanzeige: unter einem Kilometer in Metern, sonst
// in Kilometern mit einer Nachkommastelle — dieselbe Staffelung wie der
// Anfahrt-Hinweis weiter unten.
function formatiereKurzdistanz(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Aufzeichnung einer Streckenfahrt: Start und Stopp laufen automatisch über
// die Nähe zu Start-/Zielpunkt der Strecke, und der Deckungsgrad entscheidet
// darüber, ob die Fahrt öffentlich sein darf. Die GPS-Mechanik selbst steckt
// in useRideRecorder, das Fazit-Formular in RideSummaryForm — beides teilt
// sich diese Komponente mit FreeRideForm (freie Fahrt ohne Strecke).
//
// Der Tracking-Schirm ist bewusst derselbe wie bei der freien Fahrt (grosse
// Tempo-/Distanz-Zahlen, Zeit in der Statuszeile, dieselbe Kartenkonfiguration
// inkl. gefahrener Linie): einziger Unterschied ist die Abstandszeile zur
// Strecke — Anfahrt zum Startpunkt, danach "noch … km" plus Luftlinie zum
// Ziel oder, bei Rundfahrten, zum nächsten Routenpunkt.
export default function LiveTrackingForm({
  route: hereingereicht,
  kontextStrecken,
  userId,
  vehicles,
  personalBestSeconds,
  guestContinuationToken = null,
  maxPhotos,
  liveSplit = null,
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
  /** Live-Abstand zur Bestzeit; null = ausgeschaltet (Schalter und AGB,
   *  siehe lib/liveSplit.ts). */
  liveSplit?: { streckenBestzeitS: number | null } | null;
  onExit: () => void;
}) {
  // Auf der Streckenseite kommt die Strecke mit der Übersichtslinie (0117)
  // herein; die volle lädt dieselbe Seite ohnehin für die Detailkarte, und
  // useVolleGeometrie teilt sich diesen Abruf. Karte und Abstandsanzeige
  // nehmen, was da ist; der Deckungsgrad wartet auf die volle Linie (siehe
  // coveragePercent).
  const { strecke: route, stand: geometrieStand } = useVolleGeometrie(hereingereicht);
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
  // An der hereingereichten Strecke, nicht an der mit voller Linie: Start
  // und Ziel sind dieselben, und das Nachladen der Linie soll dem Recorder
  // kein neues Gate-Objekt unterschieben.
  const gate = useMemo(
    () => ({
      startPoint: hereingereicht.start_geojson.coordinates as [number, number],
      endPoint: hereingereicht.ziel_geojson.coordinates as [number, number],
    }),
    [hereingereicht],
  );
  // Stabile Referenz für die Abstandsberechnung weiter unten (nächster
  // Routenpunkt bei Rundfahrten) — dieselbe Geometrie, die die Karte
  // zeichnet, kein zweiter Datensatz.
  const streckenGeometrie = useMemo(
    () => route.geometry_geojson.coordinates as [number, number][],
    [route],
  );

  // Nur für die Anleitung beim verweigerten Standort (siehe Idle-Zweig).
  const standortFreigabe = useStandortFreigabe();
  const geraet = useGeraet();

  // Der Schlüssel ist die Strecken-ID: eine Gastfahrt auf dieser Strecke
  // landet damit unter cornice:tracking:gast:<strecke> und kollidiert weder
  // mit einer freien Fahrt noch mit einer anderen Strecke.
  const recorder = useRideRecorder({
    userId: userId ?? GUEST_TRACKING_USER_ID,
    storageKey: route.id,
    gate,
    guestContinuationToken,
  });

  // Ein kurzer Tick bei einem Viertel, der Hälfte und drei Vierteln der
  // Strecke — nur mit eingeschaltetem Live-Abstand. Der Blick aufs Telefon
  // soll dort hingehen, wo es eine neue Zahl gibt, nicht laufend.
  const vorherKmRef = useRef(0);
  useEffect(() => {
    if (!liveSplit || !recorder.hasStarted) return;
    const jetztKm = recorder.distanceKm;
    if (markeUeberschritten(vorherKmRef.current, jetztKm, route.laenge_km)) navigator.vibrate?.(12);
    vorherKmRef.current = jetztKm;
  }, [liveSplit, recorder.hasStarted, recorder.distanceKm, route.laenge_km]);
  const { phase, result, finishedTrail, clearSnapshot, discard } = recorder;

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

  // Nur auf der vollen Linie: die Übersicht weicht bis ~50 m von der
  // Strasse ab und würde den Deckungsgrad in Kehren zu tief schätzen — und
  // damit das Veröffentlichen sperren, obwohl der Server es erlaubte. Ohne
  // volle Linie (noch unterwegs oder kein Empfang) bleibt die Vorschau leer
  // und sperrt nichts; massgeblich ist ohnehin der Server
  // (logTrackedCompletion, 0052), der ist_oeffentlich nur verengen kann.
  // "ohne-quelle" heisst: die Strecke kam schon exakt herein.
  const deckungsLinieExakt = geometrieStand === "voll" || geometrieStand === "ohne-quelle";
  const coveragePercent = useMemo(() => {
    if (phase !== "finished" || !deckungsLinieExakt) return null;
    return computeRouteCoverage(
      route.geometry_geojson.coordinates as [number, number][],
      finishedTrail.map((p) => [p.lng, p.lat] as [number, number]),
    );
  }, [phase, finishedTrail, route, deckungsLinieExakt]);

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
    const pfad = streckenPfad(route);
    const zurueck = token ? `${pfad}?fortsetzen=${encodeURIComponent(token)}` : pfad;
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
      <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 overflow-y-auto overscroll-y-contain bg-background pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
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
            {/* Beim verweigerten Standort zusätzlich, wo man ihn auf diesem
                Gerät wieder freigibt — die Meldung darüber sagt nur "in den
                Einstellungen". */}
            {standortFreigabe === "denied" && geraet && (
              <p className="max-w-sm text-sm text-muted">{standortAnleitung(geraet)}</p>
            )}
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
    // Die einzige Extra-Information gegenüber der freien Fahrt: der Abstand
    // zur Strecke als Luftlinie vom GPS-Standort. Bei Punkt-zu-Punkt-Strecken
    // zum Zielpunkt, bei Rundfahrten zum nächsten Routenpunkt — Start und
    // Ziel fallen dort zusammen, ein "Abstand zum Start" sagte nach den
    // ersten Metern nichts mehr aus. "Noch … km" daneben läuft entlang der
    // Strecke (gefahrene Distanz gegen offizielle Länge), nicht als Luftlinie.
    const direktZumZielKm =
      !route.ist_rundfahrt && recorder.position
        ? haversineKm(recorder.position, gate.endPoint)
        : null;
    const naechsterPunktKm =
      route.ist_rundfahrt && recorder.position
        ? distanzZumNaechstenPunktKm(recorder.position, streckenGeometrie)
        : null;
    const abstandsTeile: string[] = [];
    if (remainingKm !== null) abstandsTeile.push(`Noch ${remainingKm.toFixed(1)} km`);
    if (route.ist_rundfahrt) {
      if (naechsterPunktKm !== null)
        abstandsTeile.push(`Route ${formatiereKurzdistanz(naechsterPunktKm)}`);
    } else if (direktZumZielKm !== null) {
      abstandsTeile.push(`Ziel ${formatiereKurzdistanz(direktZumZielKm)} Luftlinie`);
    }
    if (currentElevationM !== null) abstandsTeile.push(`${currentElevationM} m`);

    // Volle Bildschirmfläche statt eines Inline-Blocks in der Streckenansicht
    // — während einer laufenden Aufzeichnung sind die Streckendetails
    // ausgeblendet, stattdessen zeigt die Karte Route und Live-Standort.
    //
    // Scroll-Notausgang inklusive: Vor dem Start stapeln sich hier
    // Statuszeile, Kennzahlen, Start-Hinweis, Gast-Hinweis und Wachhinweis
    // über den Schaltflächen — auf kurzen Schirmen mehr als die Höhe hergibt.
    // Ohne overflow drückte das Panel "Ich bin am Start"/"Abbrechen" aus
    // dem Bild. Die Karte behält mindestens 30dvh, das Panel schrumpft nie.
    return (
      <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-y-contain bg-background">
        {/* Die Karte beginnt bei y=0: In der installierten App lagen Zoom und
            Kompass (.mapboxgl-ctrl-top-right) sonst unter der Statusleiste.
            Das ! ist nötig, weil mapbox-gl.css ungeschichtet ist und damit
            jede Tailwind-Utility ohne !important schlägt. */}
        <div className="flex-1 min-h-[30dvh] [&_.mapboxgl-ctrl-top-right]:top-[var(--safe-top)]!">
          <RouteMap
            routes={routes}
            // Derselbe Schweiz-Scheinwerfer wie auf Home und bei der freien
            // Fahrt: das Umland liegt unter einem Schleier, damit das Land
            // heraussticht. Signaturfarben gibt es hier bewusst keine — die
            // Kontext-Strecken sind absichtlich schlank geladen (KartenStrecke,
            // ohne Kennzahlen), und die gefahrene Strecke ist über
            // primaryRouteId ohnehin hervorgehoben.
            umlandSchleier
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
            // Die gefahrene Linie live mitzeichnen — wie bei der freien Fahrt
            // (FreeRideForm.tsx). Vorher lief die Karte hier ohne sie.
            trail={recorder.liveTrail}
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
        <div className="md:mx-auto md:w-full md:max-w-lg md:rounded-t-lg md:border-x flex shrink-0 flex-col gap-3 border-t border-border-strong bg-background p-4 pb-[calc(1rem+var(--safe-bottom))]">
          {/* Statuszeile in Satzschreibung statt versal in Mono: sie ist ein
              Zustand, kein Etikett — dieselbe Zeile wie bei der freien Fahrt
              (FreeRideForm.tsx), mit der Uhr rechts statt als grosser Zahl. */}
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
              {recorder.pausiert ? "Pausiert" : recorder.hasStarted ? "Aufzeichnung läuft" : "Unterwegs zum Start"}
            </p>
            <p className="text-sm text-muted tabular-nums">
              <span className="sr-only">Zeit </span>
              {formatDuration(recorder.elapsedSeconds)}
            </p>
          </div>
          {/* Ehrlich zur Wertung: die Bestzeit misst der Server von Start bis
              Ziel als Wanduhr (0098). Eine Pause verschwindet aus der
              angezeigten Zeit, nicht aus der gewerteten. */}
          {recorder.pausiert && (
            <p className="text-sm text-muted">
              Pausen zählen für die Bestzeit auf dieser Strecke mit.
            </p>
          )}
          {/* DIE GROSSEN ZAHLEN WIE BEI DER FREIEN FAHRT (FreeRideForm.tsx):
              Tempo und Distanz tragen die Fläche — der Blick aufs Telefon in
              der Halterung sucht das Tempo und wie weit man ist. Die Uhr
              steht in der Statuszeile oben, "noch … km" und der Strecken-
              abstand in der Zeile darunter. */}
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
          {liveSplit && recorder.hasStarted && (
            <LiveAbstand
              verstrichenS={recorder.elapsedSeconds}
              gefahrenKm={recorder.distanceKm}
              laengeKm={route.laenge_km}
              eigeneBestzeitS={personalBestSeconds}
              streckenBestzeitS={liveSplit.streckenBestzeitS}
            />
          )}
          {/* Die einzige Extra-Zeile gegenüber der freien Fahrt: der Abstand
              zur Strecke (siehe abstandsTeile oben). Vor dem Start die
              Anfahrt zum Startpunkt — die Zeitmessung beginnt dort von
              selbst. */}
          {recorder.hasStarted ? (
            abstandsTeile.length > 0 && (
              <p className="text-sm text-muted">{abstandsTeile.join(" · ")}</p>
            )
          ) : (
            <p className="text-sm text-muted">
              <span className="font-medium text-foreground">Fahre zum Startpunkt</span> —{" "}
              {recorder.distanceToStartKm !== null
                ? `noch ca. ${formatiereKurzdistanz(recorder.distanceToStartKm)}, die Zeitmessung startet automatisch, sobald du dort bist.`
                : "Standort wird ermittelt…"}
            </p>
          )}
          {/* Vor dem Start dieselbe Bereitschaftszeile wie bei der freien
              Fahrt (components/GpsBereitschaft.tsx), aus der Watch, die der
              Recorder hier ohnehin schon für die Anfahrt führt. Wer am Start
              wartet, sieht so, ob die automatische Zeitmessung einen
              brauchbaren Fix hat. Neben einer Standort-Fehlermeldung fehlt
              sie: "wird gesucht" unter "Zugriff verweigert" widerspräche
              sich. Nach dem Start trägt die Statuszeile oben diese Rolle. */}
          {!recorder.hasStarted && !recorder.locationError && (
            <GpsBereitschaft genauigkeitM={recorder.accuracyM} />
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
            <span>Bildschirm eingeschaltet lassen – sonst unterbricht der Browser das GPS.</span>
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
              // Vorwärts statt rückwärts: die Handlung heisst Ankommen, nicht
              // Abbrechen — wie bei der freien Fahrt (FreeRideForm.tsx).
              <>
                <button
                  type="button"
                  onClick={recorder.beginNow}
                  className={buttonVariants({ variant: "accent", size: "lg", className: "flex-1" })}
                >
                  Ich bin am Start – Zeit jetzt starten
                </button>
                <button
                  type="button"
                  onClick={handleExit}
                  className="min-h-11 text-sm text-muted transition-colors duration-fast hover:text-foreground"
                >
                  Abbrechen
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
  //
  // Die angezeigte Zeit ist ohne Pausen gerechnet, gewertet wird aber die
  // Wanduhr samt Pausen (0098). Die Bestzeit-Aussage muss sich an die
  // gewertete Zahl halten, sonst verkündet eine Fahrt mit zehn Minuten
  // Passhalt eine Bestzeit, die Fahrtseite und Rangliste danach nicht
  // zeigen. Die Wanduhr steht in den Zeitstempeln des Trails — die
  // überleben auch einen Tab-Kill, anders als jeder eigene Pausenzähler.
  const wanduhrSekunden =
    finishedTrail.length >= 2
      ? Math.round((finishedTrail[finishedTrail.length - 1].t - finishedTrail[0].t) / 1000)
      : 0;
  const gewerteteSekunden = result !== null ? Math.max(result.seconds, wanduhrSekunden) : 0;
  const mitPausen = result !== null && wanduhrSekunden - result.seconds >= 60;
  const isNewBest =
    result !== null && (personalBestSeconds === null || gewerteteSekunden < personalBestSeconds);

  // Ohne pb-[var(--safe-bottom)], anders als die Ansichten davor:
  // diese hier endet auf dem klebenden Speichern-Streifen aus
  // RideSummaryForm, und der bringt den sicheren Bereich in seiner
  // EIGENEN Polsterung mit. Beides zusammen ergab, sobald man ganz
  // nach unten gescrollt hatte, zwei Höhen des Home-Indikators unter
  // dem Knopf. Der Streifen deckt die untere Kante ohnehin immer ab,
  // also gehört der Zuschlag dorthin und nicht hierher.
  return (
    <FullscreenDialog label="Fahrt aufzeichnen" className="fixed inset-0 z-50 overflow-y-auto overscroll-y-contain bg-background pt-[var(--safe-top)]">
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
            <p className="rounded-lg border border-accent bg-accent/5 px-3 py-2 text-sm font-medium text-accent-ink">
              {personalBestSeconds === null
                ? "Erste erfasste Zeit für diese Strecke."
                : `Neue persönliche Bestzeit — bisher ${formatDauer(personalBestSeconds)}.`}
            </p>
          ) : (
            <p className="text-sm text-muted">
              Bisherige Bestzeit: {formatDauer(personalBestSeconds ?? 0)}
            </p>
          ))}
        {mitPausen && (
          <p className="text-sm text-muted">
            Zeit oben ohne Pausen. Für Bestzeit und Rangliste zählt die Zeit samt Pausen:{" "}
            {formatDauer(gewerteteSekunden)}.
          </p>
        )}

        {/* Was der Server beim Speichern ohnehin ablehnt, steht hier schon —
            mit Begründung, damit nicht nur "ging nicht" übrig bleibt. Das
            Formular bleibt bedienbar: die Ablehnung entscheidet der Server,
            nicht diese Anzeige. */}
        {bewegungsbefund && (
          <Card surface className="flex flex-col gap-2 p-4 text-sm">
            <p className="font-medium text-foreground">
              {bewegungsbefund.blockiert
                ? "Diese Fahrt lässt sich nicht speichern."
                : "War das eine Fahrt mit Auto oder Motorrad?"}
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
            confirmLabel="Fahrt verwerfen"
            cancelLabel="Fahrt behalten"
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
            isPublic={isPublic && !belowCoverageThreshold}
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


// Der Live-Abstand unter Tempo und Distanz: gegen die eigene Bestzeit gross,
// gegen die Bestzeit der Strecke klein daneben. Grün = schneller, sonst
// neutral — kein Rot: "langsamer als die Bestzeit" ist kein Fehler, und ein
// roter Wert während der Fahrt drängte genau zu dem, was AGB und SVG nicht
// wollen. Das Vorzeichen trägt die Richtung, die Farbe nur die Bestätigung.
//
// Abschaltbar durch den Fahrer selbst (AGB-Entwurf Ziff. 3.5.6), gemerkt im
// Browser. Bedienen muss man dafür nichts während der Fahrt: der Knopf ist
// für vor dem Losfahren gedacht, der Abstand selbst will nur einen Blick.
const LIVE_SPLIT_AUS_SCHLUESSEL = "strado-live-abstand-aus";

function LiveAbstand({
  verstrichenS,
  gefahrenKm,
  laengeKm,
  eigeneBestzeitS,
  streckenBestzeitS,
}: {
  verstrichenS: number;
  gefahrenKm: number;
  laengeKm: number;
  eigeneBestzeitS: number | null;
  streckenBestzeitS: number | null;
}) {
  const [aus, setAus] = useState(() => {
    try {
      return window.localStorage.getItem(LIVE_SPLIT_AUS_SCHLUESSEL) === "1";
    } catch {
      return false;
    }
  });
  function umschalten(neu: boolean) {
    setAus(neu);
    try {
      if (neu) window.localStorage.setItem(LIVE_SPLIT_AUS_SCHLUESSEL, "1");
      else window.localStorage.removeItem(LIVE_SPLIT_AUS_SCHLUESSEL);
    } catch {
      // Ohne Speicher gilt die Wahl eben nur für diese Fahrt.
    }
  }

  const eigen = liveAbstandSekunden({ verstrichenS, gefahrenKm, laengeKm, referenzS: eigeneBestzeitS });
  const strecke = liveAbstandSekunden({ verstrichenS, gefahrenKm, laengeKm, referenzS: streckenBestzeitS });

  if (aus) {
    return (
      <button
        type="button"
        onClick={() => umschalten(false)}
        className="self-start text-xs text-muted underline-offset-4 hover:underline"
      >
        Abstand zur Bestzeit einblenden
      </button>
    );
  }
  if (eigen === null && strecke === null) return null;
  const haupt = eigen ?? strecke!;
  return (
    <div className="flex flex-col gap-1">
      <dl className="flex items-end justify-between gap-4 rounded-lg bg-surface px-4 py-3">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted">{eigen !== null ? "Gegen deine Bestzeit" : "Gegen die Bestzeit"}</dt>
          <dd
            className={`text-4xl leading-none font-semibold tracking-tight tabular-nums ${haupt < 0 ? "text-success" : "text-foreground"}`}
          >
            {formatAbstand(haupt)}
          </dd>
        </div>
        {eigen !== null && strecke !== null && (
          <div className="flex flex-col items-end gap-1">
            <dt className="text-xs text-muted">Bestzeit Strecke</dt>
            <dd className="text-lg leading-none font-medium tabular-nums text-muted">{formatAbstand(strecke)}</dd>
          </div>
        )}
      </dl>
      <button
        type="button"
        onClick={() => umschalten(true)}
        className="self-end text-xs text-muted underline-offset-4 hover:underline"
      >
        Ausblenden
      </button>
    </div>
  );
}
