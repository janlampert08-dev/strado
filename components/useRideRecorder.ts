"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { liveTempoKmh } from "@/lib/livetempo";
import { FLUG_TEMPO_KMH } from "@/lib/bewegungsprofil";
import { haversineKm, type TrailPoint } from "@/lib/geo";
import { END_PROXIMITY_KM, evaluateProximity } from "@/lib/tracking";
import { MAX_JUMP_KM } from "@/lib/track";
import type { FahrtStartTicket } from "@/lib/fahrtstart";
import { fahrtStartAnlegen, fahrtStartPuls } from "@/lib/actions/fahrtstart";
import { sollPulsen } from "@/lib/fahrtstart";
import {
  saveTrackingSnapshot,
  loadTrackingSnapshot,
  FREE_RIDE_STORAGE_KEY,
  clearTrackingSnapshot,
  purgeLegacyTrackingSnapshots,
  adoptGuestTrackingSnapshot,
  type TrackingSnapshot,
} from "@/lib/trackingStorage";

// GPS-Punkte oberhalb dieser Ungenauigkeit fliessen nicht in Distanz/Trail
// ein (der Standort-Marker auf der Karte wird trotzdem aktualisiert).
// Exportiert, da RouteMap.tsx dieselbe Schwelle fürs Kamera-Nachführen
// (followLocation) anwendet — ein ungenauer Fix soll die Ansicht ebenso
// wenig verschieben wie er in Distanz/Trail einfliesst.
export const MIN_ACCURACY_M = 50;
// Verhindert, dass GPS-Zittern im Stillstand als zurückgelegte Distanz
// gezählt wird — gleiche Schwelle wie in computeTrailStats (lib/geo.ts).
const MIN_SEGMENT_KM = 0.005;
// Ohne nennenswerte Bewegung seit dieser Zeit zeigt die Tempoanzeige 0 statt
// des letzten Fahrtempos (siehe Stillstand-Zweig im watchPosition-Callback).
// Fünf Sekunden: lang genug, dass ein einzelner ungenauer Fix nicht auf 0
// springt, kurz genug, dass ein Halt an der Ampel ehrlich angezeigt wird.
const STILLSTAND_NULL_MS = 5_000;
// Der Snapshot wird nicht mehr bei jedem GPS-Fix geschrieben: bis zur
// Einführung freier Fahrten war eine Aufzeichnung eine Passfahrt von
// zwanzig Minuten, jetzt kann sie Stunden dauern — und jeder Schreibvorgang
// serialisiert den kompletten bisherigen Trail (also O(n²) über die Fahrt).
// Alle 10 Sekunden reicht für den Zweck (Wiederaufnahme nach Tab-/App-Kill);
// Zustandswechsel (Start, Stopp) werden immer sofort geschrieben.
const SNAPSHOT_INTERVAL_MS = 10_000;
// Die live gezeichnete Linie auf der Karte wird ebenfalls gedrosselt: sie
// braucht für jede Aktualisierung eine neue Koordinatenliste (die Karte
// nimmt ein Array, keine Ref). Fünf Sekunden sind auf der Karte nicht von
// einer Aktualisierung pro Sekunde zu unterscheiden.
const LIVE_TRAIL_INTERVAL_MS = 5_000;
// Ab dieser Lücke seit dem letzten GPS-Fix wird der Nutzer beim
// Zurückkehren aus dem Hintergrund gewarnt (siehe visibilitychange-Effekt
// unten). Mobile Browser drosseln oder pausieren watchPosition häufig,
// sobald der Tab/die App in den Hintergrund geht — der WakeLock schützt nur
// den Bildschirm, nicht die GPS-Watch. Ohne diesen Hinweis erfährt der
// Nutzer von der Lücke erst beim Posten, wenn die Trail-Validierung
// (MAX_JUMP_KM in lib/track.ts) fehlschlägt und die ganze Fahrt verwirft.
const GPS_GAP_WARNING_MS = 60_000;

export type RecorderPhase = "idle" | "tracking" | "finished";

// Streckenmodus: Start- und Zielpunkt der offiziellen Strecke. Die
// Aufzeichnung beginnt automatisch in der Nähe des Startpunkts und endet
// automatisch am Ziel (siehe lib/tracking.ts). Fehlt das Gate, handelt es
// sich um eine freie Fahrt: die Messung läuft ab dem ersten brauchbaren
// GPS-Fix und wird nur von Hand beendet.
export interface RideGate {
  startPoint: [number, number];
  endPoint: [number, number];
}

export interface RideRecorder {
  // Nur im Gast-Übergang relevant: Es lag ein ?fortsetzen=-Token vor, die
  // damit angekündigte Aufzeichnung war aber nicht mehr auffindbar. Der
  // Recorder startet dann bewusst NICHT — die Oberfläche muss das erklären,
  // statt den Nutzer in einer leeren Aufzeichnung stehen zu lassen.
  uebernahmeGescheitert: boolean;
  uebernahmeFehlerVerwerfen: () => void;
  phase: RecorderPhase;
  hasStarted: boolean;
  distanceKm: number;
  elapsedSeconds: number;
  speedKmh: number | null;
  position: [number, number] | null;
  accuracyM: number | null;
  headingDeg: number | null;
  // Nur im Streckenmodus vor dem Start gesetzt (Anfahrt zum Startpunkt).
  distanceToStartKm: number | null;
  // Bisher aufgezeichnete Linie für die Kartendarstellung während der Fahrt
  // (gedrosselt aktualisiert, siehe LIVE_TRAIL_INTERVAL_MS).
  liveTrail: [number, number][];
  // Dieselben Punkte, aber mit Zeitstempeln statt als reine Koordinaten —
  // für optionale clientseitige Auswertung während der Fahrt (siehe
  // useLiveLapHint), sonst ungenutzt. Gleicher Takt/Drosselung wie liveTrail.
  liveTrailPoints: TrailPoint[];
  locationError: string | null;
  result: { distanceKm: number; seconds: number } | null;
  // Der aufgezeichnete Trail nach dem Stoppen — Grundlage für den
  // Deckungsgrad im Streckenmodus und für das versteckte Formularfeld.
  finishedTrail: TrailPoint[];
  trailJson: string;
  // Das serverseitige Fahrtstart-Ticket als JSON für das versteckte
  // Formularfeld ("null", solange keines vorliegt). Ohne Ticket wird die
  // Fahrt mit dauer_quelle = "trail" gespeichert und zählt nicht für die
  // Bestenliste — siehe lib/fahrtstart.ts.
  ticketJson: string;
  // Manueller Start ("Ich bin am Start"), falls die GPS-Genauigkeit am
  // Startpunkt nicht für den automatischen Start reicht.
  beginNow: () => void;
  /**
   * Startet die GPS-Watch von Hand. Nur nötig, wenn der Hook mit
   * `autoStart: false` aufgesetzt ist (freie Fahrt): dort beginnt eine
   * Aufzeichnung erst mit einem ausdrücklichen Tippen, nicht schon beim
   * Öffnen des Schirms.
   */
  starten: () => void;
  stop: () => void;
  /**
   * Eine beendete, noch nicht gespeicherte Fahrt wieder aufnehmen — für den
   * Fall, dass "beenden" ein Versehen war. Trail, Distanz, Startzeit und
   * Ticket bleiben, nur die GPS-Watch läuft wieder an. Die Zeit im Fazit
   * zählt mit: gemessen wird Wanduhr ab dem Start, genau wie die
   * serverseitige Dauer (letzter Puls − Start, 0098) es ohnehin tut.
   */
  fortsetzen: () => void;
  /** true, solange die Aufzeichnung pausiert ist (Phase bleibt "tracking"). */
  pausiert: boolean;
  /**
   * Pause: GPS-Watch und Uhr stehen, der Trail bleibt. Anders als stop()
   * führt sie nicht ins Fazit. Die angezeigte Fahrzeit rechnet die Pause
   * heraus; die serverseitig gewertete Dauer (letzter Puls − Start, 0098)
   * tut das nicht — eine Pause kann eine Bestzeit also nur verschlechtern,
   * nie verbessern. Die Oberfläche sagt das bei Streckenfahrten dazu.
   */
  pausieren: () => void;
  weiterNachPause: () => void;
  // Aufzeichnung abbrechen/verwerfen: GPS-Watch beenden, Wake Lock
  // freigeben und den lokalen Snapshot löschen.
  discard: () => void;
  // Nach erfolgreichem Speichern — nur den Snapshot löschen, ohne dass die
  // nächste Sitzung die bereits gespeicherte Fahrt wieder aufleben lässt.
  clearSnapshot: () => void;
}

// Die gesamte GPS-Mechanik einer Aufzeichnung: Watch, Distanz, Uhr, Wake
// Lock und die lokale Wiederherstellung nach einem Tab-/App-Kill. Beide
// Aufzeichnungsarten teilen sich diesen Hook — LiveTrackingForm (Strecke,
// mit Gate) und FreeRideForm (freie Fahrt, ohne Gate) unterscheiden sich
// nur noch in der Oberfläche und im Speichern.
export function useRideRecorder({
  userId,
  storageKey,
  gate = null,
  guestContinuationToken = null,
  autoStart = true,
}: {
  // Teil des localStorage-Schlüssels: eine abgebrochene Aufzeichnung darf
  // auf einem geteilten Gerät nicht dem nächsten angemeldeten Nutzer
  // angeboten werden (siehe lib/trackingStorage.ts).
  userId: string;
  storageKey: string;
  gate?: RideGate | null;
  // Einmalig einlösbarer Marker aus dem Anmelde-Gate einer Gastfahrt: ist er
  // gesetzt und gültig, wird der als Gast aufgezeichnete Snapshot beim Mount
  // für diesen Nutzer übernommen (siehe adoptGuestTrackingSnapshot). Ohne
  // gültigen Marker passiert nichts — eine fremde Gastaufzeichnung auf einem
  // geteilten Gerät darf dem nächsten Konto nicht angeboten werden.
  guestContinuationToken?: string | null;
  /**
   * true (Vorgabe): die GPS-Watch startet beim Mount. Richtig für die
   * Streckenfahrt — dort IST das Öffnen schon die bewusste Handlung
   * ("Strecke fahren" auf der Streckenseite), und die Zeitmessung beginnt
   * ohnehin erst am Startpunkt.
   *
   * false: der Recorder wartet auf starten(). Für die freie Fahrt, deren
   * Einstieg ein Eintrag der Navigationsleiste ist. Dort begann die Messung
   * mit dem ersten GPS-Fix nach dem Antippen des Tabs — ein Fehlgriff auf
   * die mittlere, am leichtesten erreichbare Stelle der Leiste startete also
   * eine Fahrt. Eine unterbrochene Aufzeichnung wird unabhängig davon immer
   * wiederaufgenommen: die hat jemand bereits bewusst begonnen.
   */
  autoStart?: boolean;
}): RideRecorder {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [distanceToStartKm, setDistanceToStartKm] = useState<number | null>(null);
  const [result, setResult] = useState<{ distanceKm: number; seconds: number } | null>(null);
  const [finishedTrail, setFinishedTrail] = useState<TrailPoint[]>([]);
  const [liveTrail, setLiveTrail] = useState<[number, number][]>([]);
  const [liveTrailPoints, setLiveTrailPoints] = useState<TrailPoint[]>([]);
  const [trailJson, setTrailJson] = useState("[]");
  const [ticketJson, setTicketJson] = useState("null");
  const [hasStarted, setHasStarted] = useState(false);
  const [pausiert, setPausiert] = useState(false);
  const pausiertAmRef = useRef<number | null>(null);

  const ticketRef = useRef<FahrtStartTicket | null>(null);
  // Zeitpunkt des letzten abgesetzten Pulses (0098_fahrtstart_puls.sql).
  // Ein Ref und kein State: die Zahl wird aus der watchPosition-Closure
  // gelesen und geschrieben und darf kein Rendern ausloesen.
  const letzterPulsAtRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<[number, number] | null>(null);
  const lastPointTimeRef = useRef<number | null>(null);
  // MESSzeitpunkt des letzten Punktes (GeolocationPosition.timestamp), im
  // Unterschied zu lastPointTimeRef, das seine ANKUNFT festhält.
  //
  // Die Trennung ist der Kern der Tempo-Korrektur und bewusst keine
  // Vereinheitlichung: für das Tempo zwischen zwei Fixes zählt, wie weit
  // ihre Messungen auseinanderliegen — dafür ist timestamp da. Für die
  // Gesamtdauer der Fahrt und für den Trail bleibt die Ankunftszeit die
  // robustere Wahl, weil sie monoton läuft; eine Geräteuhr, die sich
  // mitten in der Fahrt per NTP korrigiert, würde dort sonst eine negative
  // Dauer erzeugen. Siehe lib/livetempo.ts.
  const lastPointMeasuredAtRef = useRef<number | null>(null);
  // Wann zuletzt ein Segment über MIN_SEGMENT_KM zurückgelegt wurde —
  // Grundlage für die Stillstand-Erkennung der Tempoanzeige (siehe
  // STILLSTAND_NULL_MS). Reine Anzeigehilfe, kein Einfluss auf Distanz,
  // Trail oder Wertung.
  const letzteBewegungAtRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  // Wann stop() lief — damit fortsetzen() die Zeit auf dem Fazit-Schirm aus
  // der angezeigten Fahrzeit herausrechnen kann (siehe dort).
  const gestopptAmRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastSnapshotAtRef = useRef(0);
  const lastLiveTrailAtRef = useRef(0);
  // Zeitpunkt des letzten GPS-Fix, unabhängig von dessen Genauigkeit — Basis
  // für die Hintergrund-Lücken-Warnung (siehe GPS_GAP_WARNING_MS).
  const lastFixAtRef = useRef<number | null>(null);
  // PERMISSION_DENIED ist endgültig (siehe watchPosition-Fehler-Callback) —
  // die transiente Hintergrund-Lücken-Warnung darf diese Meldung nicht
  // überschreiben, sonst verschwindet der Hinweis "Berechtigung erteilen"
  // nach einer Minute im Hintergrund und wirkt wie ein normaler
  // Empfangsverlust.
  const permissionDeniedRef = useRef(false);
  // Spiegelt distanceKm bzw. hasStarted für den watchPosition-Callback: der
  // Callback ist eine einmal beim Start erzeugte Closure und sähe sonst die
  // veralteten Werte aus dem ersten Render.
  const distanceKmRef = useRef(0);
  const hasStartedRef = useRef(false);
  // Verhindert, dass die Zielnähe-Prüfung bei Rundfahrten (Start = Ziel)
  // sofort nach dem Start greift.
  const hasLeftStartRef = useRef(false);
  // Nach "Weiter aufzeichnen" oder "Weiter" nach einer Pause: die
  // Zielnähe-Prüfung erst wieder scharf schalten, wenn der Zielradius
  // verlassen wurde. Sonst stoppt eine am Ziel automatisch beendete Fahrt,
  // die jemand bewusst fortsetzt, beim ersten Fix gleich wieder.
  const zielErstVerlassenRef = useRef(false);
  // Der erste Fix nach dem Fortsetzen wird gegen den letzten Punkt vor der
  // Unterbrechung geprüft (siehe dort).
  const nachUnterbrechungRef = useRef(false);
  // stop()/pausieren() sind in der watchPosition-Closure nicht in der
  // aktuellen Fassung sichtbar; der Sprungschutz ruft pausieren über die Ref.
  const pausierenRef = useRef<() => void>(() => {});
  // gate/storageKey werden beim Mount in die Watch-Closure eingeschlossen —
  // über Refs bleibt der Zugriff aktuell, ohne die Aufzeichnung bei einem
  // Render neu aufzusetzen. Die Zuweisung läuft (wie in RouteMap.tsx) über
  // einen Effekt statt direkt im Render-Durchlauf.
  const gateRef = useRef(gate);
  const storageKeyRef = useRef(storageKey);
  const userIdRef = useRef(userId);
  const autoStartRef = useRef(autoStart);
  // Nur der Wert beim Mount zählt — die Übernahme passiert einmalig im
  // Wiederherstellungs-Effekt unten, ein späteres Umschalten der Prop hätte
  // dort keine Wirkung mehr.
  const guestContinuationTokenRef = useRef(guestContinuationToken);

  useEffect(() => {
    gateRef.current = gate;
  }, [gate]);

  useEffect(() => {
    storageKeyRef.current = storageKey;
  }, [storageKey]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const publishLiveTrail = useCallback((now: number, force = false) => {
    if (!force && now - lastLiveTrailAtRef.current < LIVE_TRAIL_INTERVAL_MS) return;
    lastLiveTrailAtRef.current = now;
    setLiveTrail(trailRef.current.map((p) => [p.lng, p.lat] as [number, number]));
    // Mit Zeitstempeln, im selben Takt gedrosselt — Grundlage für den
    // optionalen Live-Streckenerkennungs-Hinweis (useLiveLapHint) einer
    // freien Fahrt. Kopie statt derselben Referenz, damit spätere Pushes auf
    // trailRef.current das bereits veröffentlichte Array nicht rückwirkend
    // verändern.
    setLiveTrailPoints([...trailRef.current]);
  }, []);

  const writeSnapshot = useCallback((snapshot: TrackingSnapshot, force = false) => {
    if (!force && snapshot.savedAt - lastSnapshotAtRef.current < SNAPSHOT_INTERVAL_MS) return;
    lastSnapshotAtRef.current = snapshot.savedAt;
    // Das Ticket hier zentral anhängen statt an jedem Aufrufer: es gibt ein
    // gutes Dutzend writeSnapshot-Aufrufe, und einer, der es vergisst, würde
    // beim Wiederaufnehmen eine wertbare Fahrt in eine unwertbare verwandeln
    // — ein Fehler, der erst Wochen später in einer fehlenden Bestzeit
    // auffiele.
    saveTrackingSnapshot(userIdRef.current, storageKeyRef.current, {
      ...snapshot,
      ticket: ticketRef.current,
    });
  }, []);

  // Meldet die aktuelle Position an den Server, höchstens alle
  // PULS_INTERVALL_MS (siehe lib/fahrtstart.ts). Die gewertete Dauer ist
  // danach die Spanne zwischen Start und letztem Puls — deshalb muss gepulst
  // werden, solange die Aufzeichnung läuft, und ein letztes Mal beim Beenden.
  //
  // Absichtlich nicht abgewartet und ohne Fehlerbehandlung: ein verlorener
  // Puls darf die Aufzeichnung nicht bremsen. Er kostet nur Genauigkeit am
  // Ende, und dafür hat der Trigger seine 500-Meter-Toleranz.
  const pulsen = useCallback(
    (punkt: [number, number], erzwingen = false, tempoKmh: number | null = null) => {
      const ticket = ticketRef.current;
      if (!ticket) return;
      const jetzt = Date.now();
      if (!erzwingen && !sollPulsen(letzterPulsAtRef.current, jetzt, tempoKmh)) return;
      letzterPulsAtRef.current = jetzt;
      void fahrtStartPuls(ticket, punkt[1], punkt[0]).catch(() => {
        // Ohne Netz kein Puls. Beim nächsten Fix wird es erneut versucht.
      });
    },
    [],
  );

  // Verhindert, dass der Bildschirm während der Aufzeichnung automatisch
  // gesperrt wird (wie bei einem laufenden Video) — GPS-Tracking im Browser
  // pausiert sonst, sobald der Screen ausgeht. Kein Fehler, wenn die Wake-
  // Lock-API fehlt (z.B. Safari/iOS) oder die Freigabe verweigert wird —
  // Tracking funktioniert dann einfach ohne diese Garantie weiter.
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  const releaseTracking = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    watchIdRef.current = null;
    intervalRef.current = null;
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      wakeLockRef.current?.release();
    };
  }, []);

  // Der Wake Lock wird vom Browser automatisch freigegeben, sobald der Tab
  // in den Hintergrund wechselt (z.B. App-Wechsel) — bei Rückkehr während
  // laufender Aufzeichnung erneut anfragen, statt den Nutzer selbst merken
  // zu lassen, dass der Schutz weg ist.
  useEffect(() => {
    if (phase !== "tracking") return;
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      // Pausiert ist keine Lücke: keine GPS-Warnung und kein Wake Lock, der
      // den Bildschirm während eines Passhalts wach hält.
      if (pausiertAmRef.current !== null) return;
      // Der Browser markiert das Sentinel bei der automatischen Freigabe als
      // "released", setzt die Ref aber nicht selbst auf null zurück — ein
      // reiner `=== null`-Check würde die Neuanfrage nach jedem
      // Hintergrund-Wechsel für den Rest der Aufzeichnung verhindern.
      if (wakeLockRef.current === null || wakeLockRef.current.released) requestWakeLock();

      // Beim Zurückkehren aus dem Hintergrund prüfen, ob währenddessen eine
      // GPS-Lücke entstanden ist, statt das erst beim Posten über eine
      // fehlgeschlagene Trail-Validierung zu erfahren (siehe
      // GPS_GAP_WARNING_MS). Ein neuer Fix überschreibt diese Meldung von
      // selbst wieder (siehe watchPosition-Erfolgs-Callback).
      const lastFixAt = lastFixAtRef.current;
      if (
        !permissionDeniedRef.current &&
        lastFixAt !== null &&
        Date.now() - lastFixAt >= GPS_GAP_WARNING_MS
      ) {
        const minutes = Math.round((Date.now() - lastFixAt) / 60_000);
        setLocationError(
          `GPS war ca. ${minutes} Minute${minutes === 1 ? "" : "n"} ohne Empfang (vermutlich im Hintergrund) — die Strecke könnte an dieser Stelle eine Lücke haben.`,
        );
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [phase, requestWakeLock]);

  // Startet die eigentliche Zeitmessung — im Streckenmodus automatisch bei
  // Annäherung an den Startpunkt (oder über beginNow), bei einer freien
  // Fahrt mit dem ersten GPS-Fix.
  const beginActualTracking = useCallback(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    setHasStarted(true);
    // Kurzer Impuls zum tatsächlichen Start der Zeitmessung — im
    // Streckenmodus fällt der nicht mit dem Tippen auf "Strecke fahren"
    // zusammen, sondern mit dem Erreichen des Startpunkts, und genau dieser
    // Moment ist am Lenker sonst nicht zu bemerken. Die Vibration API kennen
    // praktisch nur Android-Browser; auf iOS und Desktop ist der optionale
    // Aufruf ein No-op.
    navigator.vibrate?.(10);
    startTimeRef.current = Date.now();

    // Der serverseitig aufgezeichnete Start (lib/fahrtstart.ts). Bewusst
    // hier und nicht beim Tippen auf "Strecke fahren": im Streckenmodus
    // liegen zwischen beidem die Minuten der Anfahrt zum Startpunkt, und
    // gemessen werden soll, was die Anzeige auch misst.
    //
    // Absichtlich nicht abgewartet. Eine Aufzeichnung darf nicht auf eine
    // Netzantwort warten — sie beginnt oft genau dort, wo der Empfang
    // schlecht ist. Kommt das Ticket nicht, läuft die Fahrt normal weiter
    // und wird später mit dauer_quelle = "trail" gespeichert: sie zählt
    // dann nicht für die Bestenliste, geht aber auch nicht verloren.
    if (!ticketRef.current) {
      const istFreieFahrt = storageKey === FREE_RIDE_STORAGE_KEY;
      void fahrtStartAnlegen(istFreieFahrt ? "frei" : "strecke", istFreieFahrt ? null : storageKey)
        .then((ergebnis) => {
          if (!ergebnis.ok || ticketRef.current) return;
          ticketRef.current = ergebnis.ticket;
          setTicketJson(JSON.stringify(ergebnis.ticket));
          // In den Snapshot nachziehen: der wurde unten schon ohne Ticket
          // geschrieben, und genau dieser Snapshot ist es, der einen
          // abgestürzten Tab und den Weg über die Anmeldung überlebt.
          const aktuell = loadTrackingSnapshot(userId, storageKey);
          if (aktuell) {
            saveTrackingSnapshot(userId, storageKey, { ...aktuell, ticket: ergebnis.ticket });
          }
        })
        .catch(() => {
          // Kein Netz, keine Zeitwertung — die Fahrt selbst ist davon nicht
          // betroffen.
        });
    }
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - (startTimeRef.current ?? Date.now())) / 1000));
    }, 1000);
    writeSnapshot(
      {
        phase: "tracking",
        trail: trailRef.current,
        distanceKm: distanceKmRef.current,
        hasStarted: true,
        hasLeftStart: hasLeftStartRef.current,
        startTimeMs: startTimeRef.current,
        savedAt: Date.now(),
        seconds: null,
      },
      true,
    );
  }, [writeSnapshot, storageKey, userId]);

  // Nutzt Refs statt der distanceKm/elapsedSeconds-States, damit ein Aufruf
  // aus der beim Start erzeugten watchPosition-Closure (automatischer Stopp
  // am Ziel) nicht auf veraltete Werte aus dem ersten Render zugreift.
  const stop = useCallback(() => {
    releaseTracking();
    // Aus der Pause heraus beendet: die Pause gehört nicht zur Fahrzeit.
    if (pausiertAmRef.current !== null && startTimeRef.current !== null) {
      startTimeRef.current += Date.now() - pausiertAmRef.current;
    }
    pausiertAmRef.current = null;
    setPausiert(false);
    gestopptAmRef.current = Date.now();
    // Gegenstück zum Impuls beim Start (siehe beginActualTracking): die
    // Aufzeichnung endet auch automatisch am Ziel, also ohne Tastendruck.
    navigator.vibrate?.(10);

    // Schlusspuls, erzwungen: er setzt den Zeitpunkt, an dem die gewertete
    // Uhr stehen bleibt, und seine Position muss zum Ende des eingereichten
    // Tracks passen. Ohne ihn zählt der letzte reguläre Puls — bis zu einem
    // Intervall älter, was die 500-Meter-Toleranz im Trigger auffängt.
    const letzterPunkt = trailRef.current.at(-1);
    if (letzterPunkt) pulsen([letzterPunkt.lng, letzterPunkt.lat], true);

    const finalDistanceKm = distanceKmRef.current;
    const finalSeconds = startTimeRef.current
      ? Math.round((Date.now() - startTimeRef.current) / 1000)
      : 0;

    setResult({ distanceKm: finalDistanceKm, seconds: finalSeconds });
    setFinishedTrail(trailRef.current);
    setTrailJson(JSON.stringify(trailRef.current));
    publishLiveTrail(Date.now(), true);
    setPhase("finished");

    // Bis zum erfolgreichen Speichern bleibt der Snapshot bestehen — geht
    // die Verbindung oder der Tab zwischen "beenden" und "speichern"
    // verloren, findet der Mount-Effect diesen Stand wieder.
    writeSnapshot(
      {
        phase: "finished",
        trail: trailRef.current,
        distanceKm: finalDistanceKm,
        hasStarted: true,
        hasLeftStart: hasLeftStartRef.current,
        startTimeMs: startTimeRef.current,
        savedAt: Date.now(),
        seconds: finalSeconds,
      },
      true,
    );
  }, [releaseTracking, writeSnapshot, publishLiveTrail, pulsen]);

  // `resume` kommt aus dem Snapshot einer unterbrochenen Aufzeichnung —
  // statt bei Null neu zu starten, werden Trail/Distanz/Startzeit
  // übernommen und nur eine neue GPS-Watch angefragt, damit ein Tab-/
  // App-Kill während der Fahrt nicht die ganze Aufzeichnung kostet.
  const start = useCallback(
    (resume?: TrackingSnapshot) => {
      if (!navigator.geolocation) {
        setLocationError("Geolocation wird von diesem Browser nicht unterstützt.");
        return;
      }

      setLocationError(null);
      setSpeedKmh(null);
      setPosition(null);
      setAccuracyM(null);
      setHeadingDeg(null);
      setDistanceToStartKm(null);
      lastFixAtRef.current = Date.now();
      permissionDeniedRef.current = false;

      if (resume) {
        const lastPoint = resume.trail[resume.trail.length - 1];
        setDistanceKm(resume.distanceKm);
        setElapsedSeconds(
          resume.startTimeMs ? Math.round((Date.now() - resume.startTimeMs) / 1000) : 0,
        );
        setTrailJson(JSON.stringify(resume.trail));
        setHasStarted(resume.hasStarted);
        hasStartedRef.current = resume.hasStarted;
        lastPointRef.current = lastPoint ? [lastPoint.lng, lastPoint.lat] : null;
        lastPointTimeRef.current = lastPoint ? lastPoint.t : null;
        // Der Snapshot hält nur die Ankunftszeit fest. Nach einer
        // Wiederaufnahme gibt es also noch keinen Messzeitpunkt zum
        // Vergleichen — bis der erste neue Fix eintrifft, liefert die
        // Ableitung nichts, und angezeigt wird, was das Gerät selbst misst.
        lastPointMeasuredAtRef.current = null;
        trailRef.current = resume.trail;
        ticketRef.current = resume.ticket ?? null;
        setTicketJson(JSON.stringify(resume.ticket ?? null));
        startTimeRef.current = resume.startTimeMs;
        distanceKmRef.current = resume.distanceKm;
        hasLeftStartRef.current = resume.hasLeftStart;
        // Nach einer Unterbrechung ist unbekannt, wann zuletzt gefahren wurde
        // — jetzt annehmen statt null, damit die Tempoanzeige nicht beim
        // ersten Fix auf 0 springt, bevor überhaupt ein Segment vorliegt.
        letzteBewegungAtRef.current = Date.now();
        // Jede Wiederaufnahme ist eine Lücke: zwischen dem letzten Punkt im
        // Snapshot und dem ersten neuen Fix lief keine Aufzeichnung, und wer
        // in dieser Zeit weitergefahren ist, bringt einen Sprung mit, den der
        // Server dauerhaft ablehnt (MAX_JUMP_KM, lib/actions/completions.ts).
        // Die Wache gehört deshalb hierher und nicht an die Aufrufer: über
        // start(snapshot) kommen alle drei Wege herein — "Weiter aufzeichnen"
        // am Ziel, "Weiter" nach der Pause und die Wiederaufnahme nach einem
        // Tab-Kill. Am letzten fehlte sie, und das ist ausgerechnet der Weg,
        // den diese Datei oben selbst als Normalfall beschreibt.
        nachUnterbrechungRef.current = true;
        publishLiveTrail(Date.now(), true);
        if (resume.hasStarted && resume.startTimeMs) {
          intervalRef.current = setInterval(() => {
            setElapsedSeconds(
              Math.round((Date.now() - (startTimeRef.current ?? Date.now())) / 1000),
            );
          }, 1000);
        }
      } else {
        setDistanceKm(0);
        setElapsedSeconds(0);
        setTrailJson("[]");
        setHasStarted(false);
        hasStartedRef.current = false;
        lastPointRef.current = null;
        lastPointTimeRef.current = null;
        lastPointMeasuredAtRef.current = null;
        trailRef.current = [];
        startTimeRef.current = null;
        distanceKmRef.current = 0;
        hasLeftStartRef.current = false;
        letzteBewegungAtRef.current = null;
        zielErstVerlassenRef.current = false;
        nachUnterbrechungRef.current = false;
        setLiveTrail([]);
        setLiveTrailPoints([]);
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (browserPosition) => {
          // Standort-Marker immer aktualisieren, unabhängig von der GPS-
          // Genauigkeit — sonst bleibt er bei realer (oft > 50m ungenauer)
          // Standortermittlung dauerhaft unsichtbar. Nur die Distanz-/Tempo-
          // Berechnung filtert weiterhin auf ausreichend genaue Punkte.
          const point: [number, number] = [
            browserPosition.coords.longitude,
            browserPosition.coords.latitude,
          ];
          setPosition(point);
          setAccuracyM(browserPosition.coords.accuracy);
          setHeadingDeg(browserPosition.coords.heading);
          lastFixAtRef.current = Date.now();
          permissionDeniedRef.current = false;
          // Ein früherer Fehler (z.B. kurzer Empfangsverlust im Tunnel) ist
          // erledigt, sobald wieder ein Fix hereinkommt — sonst bliebe die
          // Fehlermeldung für den Rest der Fahrt stehen, obwohl GPS längst
          // wieder funktioniert.
          setLocationError(null);

          const currentGate = gateRef.current;

          // Streckenmodus: Zeitmessung/Distanz erst ab dem Startpunkt — bis
          // dahin läuft nur die Karte mit, damit der Nutzer die Anfahrt
          // verfolgen kann, ohne dass sich das schon in der Fahrzeit
          // niederschlägt. Bei einer freien Fahrt gibt es keinen Startpunkt,
          // auf den man warten könnte: die Messung beginnt hier.
          if (!hasStartedRef.current) {
            if (currentGate) {
              const proximity = evaluateProximity(
                point,
                currentGate.startPoint,
                currentGate.endPoint,
                { hasStarted: false, hasLeftStart: hasLeftStartRef.current },
              );
              setDistanceToStartKm(proximity.distanceToStartKm);
              if (proximity.shouldBeginTracking) beginActualTracking();
              return;
            }
            beginActualTracking();
          }

          // Explizit auf null/undefined statt auf Falsy prüfen: accuracy kann
          // gültig 0 sein (z.B. bei manchen Emulatoren) — ein truthy-Check
          // würde einen 0-Wert fälschlich als "genau genug" durchlassen.
          if (
            browserPosition.coords.accuracy != null &&
            browserPosition.coords.accuracy > MIN_ACCURACY_M
          ) {
            return;
          }
          const now = Date.now();
          // Der Zeitpunkt, zu dem dieser Fix GEMESSEN wurde — nicht der, zu
          // dem er hier ankommt. Beides kann weit auseinanderliegen: die
          // Watch unten läuft mit maximumAge: 2000, der Browser darf also
          // eine bis zu zwei Sekunden alte Position herausgeben. Nur für
          // das Tempo zwischen zwei Fixes verwendet; Trail und Gesamtdauer
          // bleiben bei `now` (Begründung bei lastPointMeasuredAtRef).
          const gemessenAm =
            Number.isFinite(browserPosition.timestamp) && browserPosition.timestamp > 0
              ? browserPosition.timestamp
              : now;

          // Rohdaten für die serverseitige Neuberechnung von Distanz/Dauer/
          // Deckungsgrad (siehe lib/actions/completions.ts) — nur ausreichend
          // genaue Punkte, damit Ungenauigkeit nicht fälschlich als "war
          // dort" zählt.
          // Sprungschutz nach einer Unterbrechung. Der Server lehnt eine Fahrt
          // mit mehr als MAX_JUMP_KM zwischen zwei Punkten als Ganzes ab
          // (lib/track.ts) — wer in der Pause weiterfährt, verlöre beim
          // Speichern alles, auch den Teil davor. Deshalb wird ein solcher
          // Fix nicht angehängt; die Aufzeichnung geht wieder in die Pause
          // und sagt, warum. Beenden speichert dann die Fahrt bis zur Pause.
          if (nachUnterbrechungRef.current) {
            nachUnterbrechungRef.current = false;
            const letzter = trailRef.current.at(-1);
            if (letzter && haversineKm([letzter.lng, letzter.lat], point) > MAX_JUMP_KM * 0.75) {
              pausierenRef.current();
              setLocationError(
                "Seit der Unterbrechung liegt über 1,5 km ohne Aufzeichnung dazwischen. Eine solche Lücke kann Strado nicht speichern — beende die Fahrt hier (gespeichert wird bis zur Unterbrechung) und starte für den Rest eine neue.",
              );
              return;
            }
          }
          trailRef.current.push({ lng: point[0], lat: point[1], t: now });

          // Denselben Punkt an den Server melden (0098_fahrtstart_puls.sql).
          // Bewusst genau hier: der Genauigkeitsfilter oben entscheidet damit
          // auch über den Puls, und gemeldet wird nur, was auch im Trail
          // landet. Der Trigger vergleicht den letzten Puls später mit dem
          // Ende genau dieses Trails. Das Gerätetempo steuert das
          // Pulsintervall (schnell = 10 s, sonst 20 s, lib/fahrtstart.ts).
          const geraeteTempoKmh =
            browserPosition.coords.speed !== null &&
            browserPosition.coords.speed !== undefined &&
            Number.isFinite(browserPosition.coords.speed)
              ? browserPosition.coords.speed * 3.6
              : null;
          pulsen(point, false, geraeteTempoKmh);

          if (lastPointRef.current) {
            const segment = haversineKm(lastPointRef.current, point);
            if (segment > MIN_SEGMENT_KM) {
              const gpsSpeedKmh =
                browserPosition.coords.speed !== null && browserPosition.coords.speed !== undefined
                  ? browserPosition.coords.speed * 3.6
                  : null;
              // Die Rechnung steht in lib/livetempo.ts, weil sie dort eine
              // Testdatei haben kann — components/ ist projektweit
              // ungetestet. Sie hat vorher 1392 km/h angezeigt; der Kopf
              // dort rechnet vor, wie.
              const tempo = liveTempoKmh({
                gpsTempoKmh: gpsSpeedKmh,
                segmentKm: segment,
                dtMs: gemessenAm - (lastPointMeasuredAtRef.current ?? gemessenAm),
              });
              // null heisst "gerade keine belastbare Aussage" — dann bleibt
              // der letzte gute Wert stehen, statt auf "—" zu springen und
              // im nächsten Takt zurück. Bei 2 Hz Fix-Rate wäre das ein
              // Flackern im Blickfeld während der Fahrt.
              if (tempo !== null) setSpeedKmh(tempo);
              letzteBewegungAtRef.current = now;
              distanceKmRef.current += segment;
              setDistanceKm(distanceKmRef.current);
              lastPointRef.current = point;
              lastPointTimeRef.current = now;
              lastPointMeasuredAtRef.current = gemessenAm;
            } else {
              // Stillstand (oder GPS-Zittern unter der Segment-Schwelle):
              // Dieser Zweig aktualisierte bisher nichts, und die Anzeige
              // fror auf dem letzten Fahrtempo ein — an der Ampel standen
              // weiter "52 km/h". Was das Gerät selbst misst, gilt auch hier
              // (0 km/h ist plausibel und wird übernommen); meldet es nichts,
              // fällt die Anzeige nach kurzer Zeit ohne Bewegung auf 0, statt
              // einen stehengebliebenen Wert zu zeigen. Distanz und Trail
              // bleiben davon unberührt — es geht nur um die Anzeige.
              if (
                geraeteTempoKmh !== null &&
                Number.isFinite(geraeteTempoKmh) &&
                geraeteTempoKmh >= 0 &&
                geraeteTempoKmh <= FLUG_TEMPO_KMH
              ) {
                setSpeedKmh(geraeteTempoKmh);
              } else if (
                now - (letzteBewegungAtRef.current ?? now) >= STILLSTAND_NULL_MS
              ) {
                setSpeedKmh(0);
              }
            }
          } else {
            lastPointRef.current = point;
            lastPointTimeRef.current = now;
            lastPointMeasuredAtRef.current = gemessenAm;
          }

          publishLiveTrail(now);
          writeSnapshot({
            phase: "tracking",
            trail: trailRef.current,
            distanceKm: distanceKmRef.current,
            hasStarted: true,
            hasLeftStart: hasLeftStartRef.current,
            startTimeMs: startTimeRef.current,
            savedAt: now,
            seconds: null,
          });

          // Ankunft am Ziel erkennen und die Aufzeichnung automatisch beenden
          // — analog zum automatischen Start am Startpunkt. Bei Rundfahrten
          // (Start = Ziel) erst scharf schalten, nachdem die Startnähe
          // wirklich verlassen wurde. Siehe lib/tracking.ts für die
          // (getestete) Entscheidungslogik. Eine freie Fahrt hat kein Ziel,
          // an dem sie enden könnte — sie wird nur von Hand beendet.
          if (!currentGate) return;
          const proximity = evaluateProximity(
            point,
            currentGate.startPoint,
            currentGate.endPoint,
            { hasStarted: true, hasLeftStart: hasLeftStartRef.current },
          );
          hasLeftStartRef.current = proximity.hasLeftStart;
          if (zielErstVerlassenRef.current) {
            if (haversineKm(point, currentGate.endPoint) > END_PROXIMITY_KM) {
              zielErstVerlassenRef.current = false;
            }
            return;
          }
          if (proximity.shouldAutoStop) stop();
        },
        (error) => {
          // PERMISSION_DENIED ist faktisch endgültig: der Browser ruft den
          // Erfolgs-Callback ohne erneute Erlaubnis nicht mehr auf, die
          // Aufzeichnung bekommt ab hier keine weiteren Punkte mehr. Das
          // braucht eine andere Meldung als ein Tunnel oder kurzzeitig
          // schlechter Empfang (POSITION_UNAVAILABLE/TIMEOUT), wo
          // watchPosition von selbst weiterversucht und der obige
          // Erfolgs-Callback den Fehler wieder löscht, sobald es klappt.
          if (error.code === error.PERMISSION_DENIED) {
            permissionDeniedRef.current = true;
            setLocationError(
              "Standortzugriff verweigert — ohne GPS-Berechtigung kann diese Fahrt nicht weiter aufgezeichnet werden. Bitte in den Einstellungen erlauben.",
            );
            return;
          }
          setLocationError("Kein GPS-Empfang — Aufzeichnung läuft weiter, sobald wieder Signal da ist.");
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15_000 },
      );

      requestWakeLock();
      setPhase("tracking");
    },
    [beginActualTracking, requestWakeLock, stop, writeSnapshot, publishLiveTrail, pulsen],
  );

  const starten = useCallback(() => {
    if (watchIdRef.current !== null) return;
    start();
  }, [start]);

  const fortsetzen = useCallback(() => {
    if (watchIdRef.current !== null) return;
    // DIE ZEIT AUF DEM FAZIT-SCHIRM IST KEINE FAHRZEIT. Ohne diese Zeilen lief
    // die Uhr ab dem ursprünglichen Start weiter: wer eine Minute im Fazit
    // stand und dann "Weiter aufzeichnen" wählte, bekam diese Minute als
    // gefahren angerechnet, und das Ø-Tempo im nächsten Fazit fiel (im Test
    // von 57 auf 38 km/h bei konstantem Tempo). Der Startzeitpunkt wird
    // deshalb um die Pause nach vorn geschoben.
    //
    // Das betrifft die Anzeige und die clientseitig gemessene Dauer. Die
    // serverseitig gewertete Dauer (letzter Puls − Start, 0098) sieht die
    // Pause weiterhin — sie ist bewusst eine Wanduhr, siehe AGENTS.md A1.
    // Nach dem Tab-Kill-Weg (Fazit aus dem Snapshot) fehlt der Stoppzeitpunkt;
    // dann bleibt es beim bisherigen Verhalten statt zu raten.
    if (gestopptAmRef.current !== null && startTimeRef.current !== null) {
      startTimeRef.current += Date.now() - gestopptAmRef.current;
    }
    gestopptAmRef.current = null;
    zielErstVerlassenRef.current = true;
    // Derselbe Weg wie nach einem Tab-Kill: start() mit einem Snapshot
    // übernimmt Trail, Distanz, Startzeit und Ticket aus diesem Stand und
    // fragt nur die Watch neu an. Die Refs sind hier in jedem Fall gesetzt —
    // entweder vom stop() eben oder vom Wiederherstellungszweig "finished"
    // beim Mount, der sie aus dem Snapshot befüllt.
    const stand: TrackingSnapshot = {
      phase: "tracking",
      trail: trailRef.current,
      distanceKm: distanceKmRef.current,
      hasStarted: true,
      hasLeftStart: hasLeftStartRef.current,
      startTimeMs: startTimeRef.current,
      savedAt: Date.now(),
      seconds: null,
      ticket: ticketRef.current,
    };
    setResult(null);
    start(stand);
    writeSnapshot(stand, true);
  }, [start, writeSnapshot]);

  const pausieren = useCallback(() => {
    if (!hasStartedRef.current || watchIdRef.current === null) return;
    releaseTracking();
    const jetzt = Date.now();
    pausiertAmRef.current = jetzt;
    setPausiert(true);
    // Die letzte gemessene Geschwindigkeit stehen zu lassen, war die einzige
    // Zahl auf dem Schirm, die während der Pause log: Uhr und Distanz stehen,
    // "59 km/h" blieb. Genau in dem Moment prüft jemand, ob die Pause wirkt.
    setSpeedKmh(null);
    // Ein letzter Puls mit der aktuellen Position, erzwungen — damit die
    // Serverzeit nicht hinter dem Trail zurückbleibt, falls die Pause lang
    // wird und die Fahrt danach direkt beendet wird.
    const letzterPunkt = trailRef.current.at(-1);
    if (letzterPunkt) pulsen([letzterPunkt.lng, letzterPunkt.lat], true);
    writeSnapshot(
      {
        phase: "tracking",
        trail: trailRef.current,
        distanceKm: distanceKmRef.current,
        hasStarted: true,
        hasLeftStart: hasLeftStartRef.current,
        startTimeMs: startTimeRef.current,
        savedAt: jetzt,
        seconds: null,
        pausiert: true,
        pausiertAm: jetzt,
      },
      true,
    );
  }, [releaseTracking, writeSnapshot, pulsen]);
  useEffect(() => {
    pausierenRef.current = pausieren;
  }, [pausieren]);

  const weiterNachPause = useCallback(() => {
    if (watchIdRef.current !== null) return;
    if (pausiertAmRef.current !== null && startTimeRef.current !== null) {
      startTimeRef.current += Date.now() - pausiertAmRef.current;
    }
    pausiertAmRef.current = null;
    setPausiert(false);
    setLocationError(null);
    zielErstVerlassenRef.current = true;
    const stand: TrackingSnapshot = {
      phase: "tracking",
      trail: trailRef.current,
      distanceKm: distanceKmRef.current,
      hasStarted: true,
      hasLeftStart: hasLeftStartRef.current,
      startTimeMs: startTimeRef.current,
      savedAt: Date.now(),
      seconds: null,
      ticket: ticketRef.current,
      pausiert: false,
      pausiertAm: null,
    };
    start(stand);
    writeSnapshot(stand, true);
  }, [start, writeSnapshot]);

  const discard = useCallback(() => {
    releaseTracking();
    clearTrackingSnapshot(userIdRef.current, storageKeyRef.current);
  }, [releaseTracking]);

  // Nur für den Gast-Übergang: true, wenn ein ?fortsetzen=-Token vorlag,
  // die aufgezeichnete Fahrt darüber aber nicht mehr gefunden wurde.
  const [uebernahmeGescheitert, setUebernahmeGescheitert] = useState(false);

  // Weg aus dem Fehlerbildschirm zurück in eine normale, leere
  // Aufzeichnung. Nötig, weil der Bildschirm auf derselben Route liegt wie
  // der Startbildschirm (/fahrten/neu, nur mit ?fortsetzen=): eine
  // Client-Navigation dorthin hängt die Komponente nicht aus, das Flag
  // bliebe stehen, und der Knopf zeigte wieder denselben Fehler. Ein
  // vollständiges Neuladen wäre der grobe Weg zum selben Ziel — der
  // Recorder steht hier ohnehin unangetastet auf "idle", weil die Übernahme
  // vor jedem Start abgebrochen hat.
  const uebernahmeFehlerVerwerfen = useCallback(() => {
    setUebernahmeGescheitert(false);
  }, []);

  const clearSnapshot = useCallback(() => {
    clearTrackingSnapshot(userIdRef.current, storageKeyRef.current);
  }, []);

  // Beim Mount zuerst prüfen, ob für diesen Schlüssel noch eine
  // unterbrochene Aufzeichnung lokal gespeichert ist (Tab-/App-Kill,
  // Verbindungsabbruch vor dem Speichern). War sie bereits fertig, springt
  // die Ansicht direkt zum Fazit, ohne GPS neu anzufragen; war sie noch am
  // Laufen, wird sie fortgesetzt statt bei Null neu zu beginnen.
  //
  // setTimeout verschiebt den Start in einen Callback (statt synchron im
  // Effekt-Body), damit die darin ausgelösten setState-Aufrufe nicht als
  // Render-Kaskade zählen.
  useEffect(() => {
    // Reste aus der Zeit vor der Nutzertrennung wegräumen, bevor irgendetwas
    // wiederhergestellt wird.
    purgeLegacyTrackingSnapshots();
    // Vor dem Laden: eine Fahrt, die dieser Nutzer noch abgemeldet
    // aufgezeichnet hat, liegt unter dem Gast-Schlüssel und würde sonst
    // nicht gefunden.
    let uebernahmeFehlgeschlagen = false;
    if (guestContinuationTokenRef.current) {
      uebernahmeFehlgeschlagen = !adoptGuestTrackingSnapshot(
        userIdRef.current,
        storageKeyRef.current,
        guestContinuationTokenRef.current,
      );
    }
    const snapshot = loadTrackingSnapshot(userIdRef.current, storageKeyRef.current);

    // Der Rückgabewert wurde bisher verworfen. Schlägt die Übernahme fehl —
    // Token abgelaufen (2 h, während der Snapshot 24 h lebt),
    // Bestätigungslink in einem anderen Browser geöffnet, localStorage
    // gesperrt — findet loadTrackingSnapshot nichts, und der Code lief unten
    // in start(undefined). Die Seite ist wegen des ?fortsetzen=-Markers
    // bereits aufgeklappt, fragte also GPS an und begann eine NEUE Fahrt.
    //
    // Wer sich gerade extra registriert hat, um seine aufgezeichnete Fahrt zu
    // speichern, landete damit kommentarlos in einem leeren Recorder — die
    // Fahrt war weg, und nichts sagte es ihm. Deshalb hier abbrechen statt
    // starten; die Oberfläche zeigt stattdessen einen Hinweis.
    if (uebernahmeFehlgeschlagen && !snapshot) {
      setUebernahmeGescheitert(true);
      return;
    }

    const timeout = setTimeout(() => {
      if (snapshot?.phase === "finished") {
        // Dieser Zweig geht an start() vorbei, das sonst das Ticket
        // zurückholt. Ohne die zwei Zeilen verliert eine bereits beendete,
        // nur noch nicht gespeicherte Fahrt beim Neuladen des Fazit-Schirms
        // ihre Zeitwertung — und zwar lautlos.
        ticketRef.current = snapshot.ticket ?? null;
        setTicketJson(JSON.stringify(snapshot.ticket ?? null));
        trailRef.current = snapshot.trail;
        distanceKmRef.current = snapshot.distanceKm;
        startTimeRef.current = snapshot.startTimeMs;
        hasStartedRef.current = true;
        hasLeftStartRef.current = snapshot.hasLeftStart;
        setHasStarted(true);
        setResult({ distanceKm: snapshot.distanceKm, seconds: snapshot.seconds ?? 0 });
        setFinishedTrail(snapshot.trail);
        setTrailJson(JSON.stringify(snapshot.trail));
        setLiveTrail(snapshot.trail.map((p) => [p.lng, p.lat] as [number, number]));
        setPhase("finished");
        return;
      }
      if (snapshot?.phase === "tracking" && snapshot.pausiert) {
        // Pausiert verlassen, pausiert wiederaufgenommen: Stand übernehmen,
        // aber keine GPS-Watch anfragen. Die Uhr steht auf dem Wert zum
        // Zeitpunkt der Pause.
        ticketRef.current = snapshot.ticket ?? null;
        setTicketJson(JSON.stringify(snapshot.ticket ?? null));
        trailRef.current = snapshot.trail;
        distanceKmRef.current = snapshot.distanceKm;
        startTimeRef.current = snapshot.startTimeMs;
        hasStartedRef.current = true;
        hasLeftStartRef.current = snapshot.hasLeftStart;
        pausiertAmRef.current = snapshot.pausiertAm ?? Date.now();
        setHasStarted(true);
        setDistanceKm(snapshot.distanceKm);
        setTrailJson(JSON.stringify(snapshot.trail));
        setLiveTrail(snapshot.trail.map((p) => [p.lng, p.lat] as [number, number]));
        setLiveTrailPoints([...snapshot.trail]);
        const pausiertAm = snapshot.pausiertAm ?? Date.now();
        setElapsedSeconds(
          snapshot.startTimeMs ? Math.round((pausiertAm - snapshot.startTimeMs) / 1000) : 0,
        );
        setPausiert(true);
        setSpeedKmh(null);
        setPhase("tracking");
        return;
      }
      if (snapshot?.phase === "tracking") {
        start(snapshot);
        return;
      }
      if (autoStartRef.current) start();
    }, 0);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    uebernahmeGescheitert,
    uebernahmeFehlerVerwerfen,
    phase,
    hasStarted,
    distanceKm,
    elapsedSeconds,
    speedKmh,
    position,
    accuracyM,
    headingDeg,
    distanceToStartKm,
    liveTrail,
    liveTrailPoints,
    locationError,
    result,
    finishedTrail,
    trailJson,
    ticketJson,
    beginNow: beginActualTracking,
    starten,
    stop,
    fortsetzen,
    pausiert,
    pausieren,
    weiterNachPause,
    discard,
    clearSnapshot,
  };
}
