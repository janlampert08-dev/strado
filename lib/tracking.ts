import { haversineKm } from "@/lib/geo";

// Grosszügig genug für GPS-Ungenauigkeit und Parkplätze/Zufahrten am
// Streckenanfang, aber eng genug, um zu verhindern, dass die Zeitmessung
// schon Kilometer vor dem eigentlichen Start beginnt.
export const START_PROXIMITY_KM = 0.15;
// Gleicher Toleranzwert für den Zielpunkt — die Aufzeichnung stoppt
// automatisch, sobald der Nutzer ihn erreicht.
export const END_PROXIMITY_KM = 0.15;

export interface ProximityState {
  hasStarted: boolean;
  hasLeftStart: boolean;
}

export interface ProximityResult {
  distanceToStartKm: number | null;
  shouldBeginTracking: boolean;
  hasLeftStart: boolean;
  shouldAutoStop: boolean;
}

// Kürzester Abstand von der aktuellen Position zur Streckenlinie, als Minimum
// über die Stützpunkte. Für Rundfahrten, bei denen Start- und Zielpunkt
// zusammenfallen und deshalb kein einzelner Punkt als Ziel taugt: dort sagt
// die Anzeige, wie weit der nächste Routenpunkt entfernt ist, statt einer
// Entfernung zu einem Start, an dem man längst vorbeigefahren sein kann.
//
// Bewusst reine Stützpunkt-Näherung ohne Segmentprojektion: bei den
// Stützpunktabständen kuratierter Strecken ist der Fehler gegenüber dem
// echten Linienabstand vernachlässigbar, und die Anzeige braucht eine
// Grössenordnung ("noch ca. 300 m bis zur Route"), kein Map-Matching.
export function distanzZumNaechstenPunktKm(
  position: [number, number],
  punkte: [number, number][],
): number | null {
  if (punkte.length === 0) return null;
  let min = Infinity;
  for (const punkt of punkte) {
    const distanz = haversineKm(position, punkt);
    if (distanz < min) min = distanz;
  }
  return min;
}

// Reine Zustandslogik für Auto-Start/Auto-Stop beim Live-Tracking
// (components/LiveTrackingForm.tsx), extrahiert für Testbarkeit. Verhindert
// bei Rundstrecken (Start = Ziel), dass die Aufzeichnung sofort nach dem
// Start wieder stoppt: die Zielnähe-Prüfung greift erst, nachdem die
// Startnähe tatsächlich verlassen wurde (hasLeftStart), daher die
// if/else-if-Struktur — beides wird nie im selben Aufruf geprüft.
export function evaluateProximity(
  point: [number, number],
  startPoint: [number, number],
  endPoint: [number, number],
  state: ProximityState,
  startProximityKm: number = START_PROXIMITY_KM,
  endProximityKm: number = END_PROXIMITY_KM,
): ProximityResult {
  if (!state.hasStarted) {
    const distanceToStartKm = haversineKm(point, startPoint);
    return {
      distanceToStartKm,
      shouldBeginTracking: distanceToStartKm <= startProximityKm,
      hasLeftStart: state.hasLeftStart,
      shouldAutoStop: false,
    };
  }

  if (!state.hasLeftStart) {
    return {
      distanceToStartKm: null,
      shouldBeginTracking: false,
      hasLeftStart: haversineKm(point, startPoint) > startProximityKm,
      shouldAutoStop: false,
    };
  }

  return {
    distanceToStartKm: null,
    shouldBeginTracking: false,
    hasLeftStart: true,
    shouldAutoStop: haversineKm(point, endPoint) <= endProximityKm,
  };
}
