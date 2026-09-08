"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectLaps, type RouteCandidate } from "@/lib/lapDetection";
import type { TrailPoint } from "@/lib/geo";
import type { ExploreRoute } from "@/types/database";

// Nur zur Beruhigung/Orientierung während der Fahrt geprüft, deshalb
// grosszügig gedrosselt — nicht bei jedem GPS-Fix und nicht so häufig wie
// die Kartendarstellung (LIVE_TRAIL_INTERVAL_MS in useRideRecorder).
const CHECK_INTERVAL_MS = 20_000;
// Begrenzt die pro Prüfung durchlaufene Trail-Länge bei einer mehrstündigen
// Fahrt (die Erkennung selbst läuft weiterhin auf dem vollen Trail, aber
// serverseitig beim Speichern — siehe logFreeRide). 90 Minuten sind
// grosszügig genug für jede realistische Rundstrecken-Dauer.
const WINDOW_MS = 90 * 60 * 1000;
// Unterhalb dieses Fortschritts ist ein Treffer zu unsicher für einen
// Hinweis (z.B. eine kurz gekreuzte Nebenstrasse) — reiner UI-Schwellenwert
// ohne jeden Einfluss auf die serverseitige, massgebliche Erkennung.
const MIN_HINT_FRACTION = 0.15;

export interface LiveLapHint {
  routeId: string;
  routeName: string;
  fraction: number;
  completed: boolean;
}

// Rein clientseitiger, unverbindlicher Hinweis während einer freien Fahrt
// ("Strecke X wird erkannt"): dieselbe Erkennungslogik wie serverseitig
// (lib/lapDetection.ts, identischer Code — keine zweite, abweichende
// Implementierung), aber auf ein Zeitfenster begrenzt und selten ausgeführt,
// um Akku/CPU während einer laufenden Aufzeichnung zu schonen. Massgeblich
// bleibt ausschliesslich die serverseitige Erkennung beim Speichern
// (logFreeRide) — dieser Hook dient nur der Rückmeldung an den Nutzer,
// keiner Entscheidung über Sichtbarkeit oder Bestenlisten.
export function useLiveLapHint(
  active: boolean,
  liveTrailPoints: TrailPoint[],
  routes: ExploreRoute[],
): LiveLapHint | null {
  const [hint, setHint] = useState<LiveLapHint | null>(null);
  const trailRef = useRef(liveTrailPoints);
  // Verhindert, dass eine bereits als "erkannt!" gezeigte Runde bei jeder
  // weiteren Prüfung erneut auftaucht, solange sie noch im 90-Minuten-
  // Fenster liegt.
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    trailRef.current = liveTrailPoints;
  }, [liveTrailPoints]);

  const candidates = useMemo<(RouteCandidate & { name: string })[]>(
    () =>
      routes.map((r) => ({
        routeId: r.id,
        name: r.name,
        coordinates: r.geometry_geojson.coordinates,
        isLoop: r.ist_rundfahrt,
      })),
    [routes],
  );

  useEffect(() => {
    if (!active || candidates.length === 0) {
      // setState in einem Timeout statt direkt im Effekt-Body — vermeidet
      // Kaskaden-Renders (react-hooks/set-state-in-effect), wirkt aber
      // praktisch sofort.
      const resetId = setTimeout(() => setHint(null), 0);
      return () => clearTimeout(resetId);
    }

    const interval = setInterval(() => {
      const cutoff = Date.now() - WINDOW_MS;
      const windowTrail = trailRef.current.filter((p) => p.t >= cutoff);
      if (windowTrail.length < 2) return;

      const { laps, partialAttempts } = detectLaps(windowTrail, candidates);

      const freshLap = laps.find((lap) => !notifiedRef.current.has(`${lap.routeId}:${lap.exitT}`));
      if (freshLap) {
        notifiedRef.current.add(`${freshLap.routeId}:${freshLap.exitT}`);
        setHint({
          routeId: freshLap.routeId,
          routeName: candidates.find((c) => c.routeId === freshLap.routeId)?.name ?? "Strecke",
          fraction: 1,
          completed: true,
        });
        return;
      }

      const best = partialAttempts
        .filter((p) => p.maxProgressFraction >= MIN_HINT_FRACTION)
        .sort((a, b) => b.maxProgressFraction - a.maxProgressFraction)[0];

      if (!best) {
        setHint(null);
        return;
      }
      setHint({
        routeId: best.routeId,
        routeName: candidates.find((c) => c.routeId === best.routeId)?.name ?? "Strecke",
        fraction: best.maxProgressFraction,
        completed: false,
      });
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [active, candidates]);

  return hint;
}
