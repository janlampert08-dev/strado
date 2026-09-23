"use client";

import { useSyncExternalStore } from "react";
import {
  GUEST_TRACKING_USER_ID,
  gastfahrtSchluesselAusZiel,
  loadTrackingSnapshot,
} from "@/lib/trackingStorage";
import { formatDuration } from "@/lib/format";

interface Stand {
  distanzKm: number;
  sekunden: number | null;
}

// Pro Schlüssel ein zwischengespeicherter Wert: useSyncExternalStore
// verlangt eine stabile Referenz, sonst rendert es endlos.
const cache = new Map<string, Stand | null>();

function lese(schluessel: string): Stand | null {
  if (!cache.has(schluessel)) {
    const snapshot = loadTrackingSnapshot(GUEST_TRACKING_USER_ID, schluessel);
    cache.set(
      schluessel,
      snapshot?.hasStarted ? { distanzKm: snapshot.distanceKm, sekunden: snapshot.seconds } : null,
    );
  }
  return cache.get(schluessel) ?? null;
}

const nichtsZuAbonnieren = () => () => {};

/**
 * Die Registrierung als Belohnung statt als Wand: wer aus dem Fazit einer
 * Gastfahrt hierherkommt, sieht oben seine eigene Fahrt — und warum er
 * gerade ein Konto anlegt. Vorher stand da dasselbe leere Formular wie für
 * jeden anderen Besuch.
 *
 * Liest nur den Gast-Snapshot im Browser, ändert nichts daran. Fehlt er
 * (anderer Browser, abgelaufen, Private Browsing), bleibt die Zeile weg —
 * dann wäre "deine Fahrt wartet" eine Behauptung ohne Grundlage.
 */
export default function WartendeFahrt({ ziel }: { ziel: string | undefined }) {
  const schluessel = gastfahrtSchluesselAusZiel(ziel);
  const stand = useSyncExternalStore(
    nichtsZuAbonnieren,
    () => (schluessel ? lese(schluessel) : null),
    () => null,
  );
  if (!stand) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-title font-semibold tracking-tight">Deine Fahrt wartet</p>
      <p className="text-sm text-muted">
        <span className="tabular-nums text-foreground">
          {stand.distanzKm.toFixed(1)} km
          {stand.sekunden !== null && <> · {formatDuration(Math.round(stand.sekunden))}</>}
        </span>{" "}
        — mit einem Konto landet sie in deinem Profil und in den Ranglisten.
      </p>
    </div>
  );
}
