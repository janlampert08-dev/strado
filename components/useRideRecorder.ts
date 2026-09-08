"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haversineKm, type TrailPoint } from "@/lib/geo";
import { evaluateProximity } from "@/lib/tracking";
import {
  saveTrackingSnapshot,
  loadTrackingSnapshot,
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
  // Manueller Start ("Bin schon am Start"), falls die GPS-Genauigkeit am
  // Startpunkt nicht für den automatischen Start reicht.
  beginNow: () => void;
  stop: () => void;
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
  const [hasStarted, setHasStarted] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<[number, number] | null>(null);
  const lastPointTimeRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
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
  // gate/storageKey werden beim Mount in die Watch-Closure eingeschlossen —
  // über Refs bleibt der Zugriff aktuell, ohne die Aufzeichnung bei einem
  // Render neu aufzusetzen. Die Zuweisung läuft (wie in RouteMap.tsx) über
  // einen Effekt statt direkt im Render-Durchlauf.
  const gateRef = useRef(gate);
  const storageKeyRef = useRef(storageKey);
  const userIdRef = useRef(userId);
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
    saveTrackingSnapshot(userIdRef.current, storageKeyRef.current, snapshot);
  }, []);

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
    // Kurzer Impuls zum tatsaechlichen Start der Zeitmessung — im
    // Streckenmodus faellt der nicht mit dem Tippen auf "Strecke starten"
    // zusammen, sondern mit dem Erreichen des Startpunkts, und genau dieser
    // Moment ist am Lenker sonst nicht zu bemerken. Die Vibration API kennen
    // praktisch nur Android-Browser; auf iOS und Desktop ist der optionale
    // Aufruf ein No-op.
    navigator.vibrate?.(10);
    startTimeRef.current = Date.now();
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
  }, [writeSnapshot]);

  // Nutzt Refs statt der distanceKm/elapsedSeconds-States, damit ein Aufruf
  // aus der beim Start erzeugten watchPosition-Closure (automatischer Stopp
  // am Ziel) nicht auf veraltete Werte aus dem ersten Render zugreift.
  const stop = useCallback(() => {
    releaseTracking();
    // Gegenstueck zum Impuls beim Start (siehe beginActualTracking): die
    // Aufzeichnung endet auch automatisch am Ziel, also ohne Tastendruck.
    navigator.vibrate?.(10);

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
  }, [releaseTracking, writeSnapshot, publishLiveTrail]);

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
        trailRef.current = resume.trail;
        startTimeRef.current = resume.startTimeMs;
        distanceKmRef.current = resume.distanceKm;
        hasLeftStartRef.current = resume.hasLeftStart;
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
        trailRef.current = [];
        startTimeRef.current = null;
        distanceKmRef.current = 0;
        hasLeftStartRef.current = false;
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

          // Rohdaten für die serverseitige Neuberechnung von Distanz/Dauer/
          // Deckungsgrad (siehe lib/actions/completions.ts) — nur ausreichend
          // genaue Punkte, damit Ungenauigkeit nicht fälschlich als "war
          // dort" zählt.
          trailRef.current.push({ lng: point[0], lat: point[1], t: now });

          if (lastPointRef.current) {
            const segment = haversineKm(lastPointRef.current, point);
            if (segment > MIN_SEGMENT_KM) {
              const dtHours = (now - (lastPointTimeRef.current ?? now)) / 3_600_000;
              const gpsSpeedKmh =
                browserPosition.coords.speed !== null && browserPosition.coords.speed !== undefined
                  ? browserPosition.coords.speed * 3.6
                  : null;
              setSpeedKmh(gpsSpeedKmh ?? (dtHours > 0 ? segment / dtHours : null));
              distanceKmRef.current += segment;
              setDistanceKm(distanceKmRef.current);
              lastPointRef.current = point;
              lastPointTimeRef.current = now;
            }
          } else {
            lastPointRef.current = point;
            lastPointTimeRef.current = now;
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
    [beginActualTracking, requestWakeLock, stop, writeSnapshot, publishLiveTrail],
  );

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
      start(snapshot?.phase === "tracking" ? snapshot : undefined);
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
    beginNow: beginActualTracking,
    stop,
    discard,
    clearSnapshot,
  };
}
