import { FLUG_TEMPO_KMH } from "@/lib/bewegungsprofil";

// Das Tempo, das der Aufzeichnungsschirm während der Fahrt anzeigt
// (components/useRideRecorder.ts → LiveTrackingForm/FreeRideForm).
//
// WARUM DAS EINE EIGENE DATEI MIT TESTS IST
//
// Die Anzeige stand auf 1392 km/h. Die Rechnung dahinter war
//
//     segment / ((now - letzterPunktZeit) / 3_600_000)
//
// und sie hatte drei Löcher, von denen jedes für sich harmlos aussieht:
//
//   1. `now` war `Date.now()` — der Zeitpunkt, zu dem ein GPS-Fix im
//      Callback ANKOMMT, nicht der, zu dem er GEMESSEN wurde. Dafür gibt
//      es GeolocationPosition.timestamp, das direkt danebenlag und
//      ungenutzt blieb.
//   2. Die Watch läuft mit `maximumAge: 2000`. Der Browser darf also eine
//      bis zu zwei Sekunden alte Position herausgeben. Kommt ein
//      zwischengespeicherter Fix und unmittelbar danach ein frischer,
//      liegen zwei Punkte METER auseinander, ihre Ankunftszeiten aber nur
//      MILLISEKUNDEN.
//   3. Es gab keine Obergrenze.
//
// Die Zahl geht exakt auf: die Mindestsegmentlänge ist 5 m, und
// 0,005 km / 1392 km/h sind 12,9 ms. Ein Fünf-Meter-Sprung, dessen zweiter
// Punkt 13 ms später ankommt, IST 1392 km/h. 10 m in 26 ms ergeben
// dieselbe Zahl — es zählt das Verhältnis, nicht der einzelne Wert.
//
// Diese Datei existiert, damit genau diese Rechnung eine Testdatei haben
// kann. Im Recorder selbst könnte sie das nicht: Vitest läuft
// projektweit auf `environment: "node"`, und alles unter `components/`
// ist deshalb ungetestet (siehe AGENTS.md). Die Regel dort lautet, Logik,
// die einen Test verdient, nach `lib/` zu heben — und eine Rechnung, die
// schon einmal um den Faktor 20 danebenlag, verdient einen.
//
// Nicht in lib/geo.ts, obwohl MIN_SEGMENT_KM dort steht: diese Datei
// braucht FLUG_TEMPO_KMH, und lib/bewegungsprofil.ts importiert bereits
// aus lib/geo.ts. Der Import andersherum wäre ein Zyklus. Nicht in
// lib/bewegungsprofil.ts selbst, weil es dort um die Auswertung einer
// FERTIGEN Aufzeichnung geht und nicht um die Anzeige während der Fahrt.

// WAS DIESE DATEI NICHT LEISTET, und das gehört danebengeschrieben:
//
// Der Genauigkeitsfilter im Recorder lässt Fixes bis 50 m Ungenauigkeit
// durch (MIN_ACCURACY_M). Bei zwei solchen Punkten steckt im abgeleiteten
// Tempo ein Fehler von bis zu 3,6 × 100 m / dt — bei einer Sekunde also
// ±360 km/h. Die Intervallschwelle unten macht daraus keine genaue Zahl,
// sie macht daraus nur eine, die nicht ins Absurde läuft; die Obergrenze
// tut den Rest.
//
// Das ist vertretbar, weil dieser Rückfall selten greift und nie gewertet
// wird: auf einem Telefon mit GNSS-Fix liefert coords.speed fast immer
// einen Wert, und die Dauer, die in die Rangliste eingeht, kommt seit
// 0098_fahrtstart_puls.sql ohnehin vom Server. Wer die abgeleitete Zahl
// genauer haben will, muss das Intervall an die gemeldete Genauigkeit
// koppeln statt an eine feste Schwelle — dafür fehlen hier die Messdaten,
// und eine erfundene Formel wäre schlechter als diese Notiz.

/**
 * Kürzester Abstand zwischen zwei Fixes, aus dem sich überhaupt ein Tempo
 * ableiten lässt.
 *
 * Der Wert folgt aus dem Messfehler, nicht aus dem Geschmack: bei rund 5 m
 * Ortsgenauigkeit schlägt die Ungenauigkeit mit `5 m / dt` aufs Ergebnis
 * durch. Bei einer Sekunde sind das ±18 km/h — unschön, aber brauchbar.
 * Bei einer Viertelsekunde sind es ±72 km/h, und die Anzeige misst dann
 * das Rauschen statt die Fahrt.
 *
 * Unterhalb dieser Schwelle gibt `liveTempoKmh` deshalb null zurück, und
 * der Aufrufer lässt den letzten guten Wert stehen, statt auf "—" zu
 * springen.
 */
export const MIN_TEMPO_INTERVALL_MS = 1000;

/** Verwirft, was keine Autofahrt sein kann — und alles Unbrauchbare. */
function plausibel(kmh: number | null): number | null {
  if (kmh === null || !Number.isFinite(kmh) || kmh < 0) return null;
  // Dieselbe Schwelle, die lib/bewegungsprofil.ts benutzt, um eine
  // Aufzeichnung als Flug zurückzuweisen. Bewusst dieselbe Quelle: zwei
  // Zahlen für "das kann kein Auto gewesen sein" laufen auseinander.
  return kmh > FLUG_TEMPO_KMH ? null : kmh;
}

/**
 * Das anzuzeigende Tempo, oder null, wenn es gerade keine belastbare
 * Aussage gibt.
 *
 * Reihenfolge mit Absicht: was das Gerät selbst misst
 * (`GeolocationCoordinates.speed`, vom GNSS-Chip aus dem Doppler-Effekt
 * bestimmt), ist genauer als alles, was sich aus zwei Positionen ableiten
 * lässt. Nur wenn der Browser es nicht liefert — Desktop-Chrome, und auf
 * Android oft, wenn der Fix aus WLAN oder Funkzelle statt vom Chip
 * stammt — oder wenn es unplausibel ist, wird gerechnet.
 *
 * @param dtMs Abstand der MESSzeitpunkte beider Fixes, nicht ihrer
 *             Ankunftszeiten. Das ist der ganze Punkt; siehe Kopf.
 */
export function liveTempoKmh({
  gpsTempoKmh,
  segmentKm,
  dtMs,
}: {
  /** coords.speed × 3,6, oder null wenn der Browser nichts liefert. */
  gpsTempoKmh: number | null;
  /** Abstand der beiden Punkte in Kilometern. */
  segmentKm: number;
  /** Abstand der beiden Messzeitpunkte in Millisekunden. */
  dtMs: number;
}): number | null {
  const vomGeraet = plausibel(gpsTempoKmh);
  if (vomGeraet !== null) return vomGeraet;

  if (!Number.isFinite(segmentKm) || segmentKm < 0) return null;
  // Deckt auch den Rückwärtssprung ab: manche Geräte korrigieren ihre Uhr
  // mitten in der Fahrt, dtMs wird dann negativ.
  if (!Number.isFinite(dtMs) || dtMs < MIN_TEMPO_INTERVALL_MS) return null;

  return plausibel(segmentKm / (dtMs / 3_600_000));
}
