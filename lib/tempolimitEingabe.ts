import type { TempolimitSegment } from "@/types/database";

// Plausibilitätsgrenzen für die Tempolimit-Segmente, die der Client mit
// einem Streckenvorschlag schickt.
//
// Bewusst NICHT MIN_KMH/MAX_KMH aus lib/tempolimitAbgleich.ts (20/120):
// die bedeuten "plausibles amtliches Schweizer Limit" und werden nur auf
// die amtlichen Objekte angewandt. Eine Strecke, die über die Grenze
// reicht, trägt legitim 130 — mit 120 als Obergrenze wäre der ganze
// Vorschlag abgelehnt. Hier geht es um etwas Schwächeres: was überhaupt
// ein Tempolimit sein kann.
export const MIN_EINGABE_KMH = 5;
export const MAX_EINGABE_KMH = 200;

/**
 * Prüft ein einzelnes Segment aus dem Formular auf Form UND Plausibilität.
 *
 * Vorher wurde nur `typeof === "number"` und `Number.isFinite` geprüft. Was
 * dabei durchging, ist am echten Modul gemessen:
 *
 *     { km_von: 0, km_bis: 10, kmh: -100 }  ->  Ø -100 km/h, Fahrzeit -7 min
 *     { km_von: 0, km_bis: 12, kmh: 9999 }  ->  Ø 9999 km/h, Fahrzeit 0 min
 *     { km_von: 0, km_bis: 12, kmh: 0.4 }   ->  angezeigt 0 km/h, gerechnet
 *                                               wird aber mit der Kategorie-
 *                                               Faustregel (13 min), weil
 *                                               `if (avgLimit)` die 0 als
 *                                               "kein Wert" liest
 *
 * Diese Zahlen stehen danach auf der Streckenseite und — was schwerer wiegt —
 * in den unauthentifizierten Endpunkten unter /api/strecken, die jede fremde
 * Origin lesen darf. Der echte Erzeuger (buildSpeedSegments in
 * lib/mapboxDirections.ts) liefert nichts dergleichen: unbekannte Abschnitte
 * bekommen dort kmh 80 mit bekannt=false, nie 0 und nie einen Bruch.
 *
 * km_bis >= km_von statt >: zwei Stützpunkte unter 5 m Abstand runden auf
 * zwei Nachkommastellen zur selben Kilometermarke, ein solches Segment ist
 * also echt und hat schlicht das Gewicht 0. Ein NEGATIVER Abschnitt ist
 * etwas anderes — er zieht im längengewichteten Mittel in die Gegenrichtung
 * und lässt sich damit gegen die übrigen Segmente ausspielen.
 */
export function istPlausiblesTempolimitSegment(value: unknown): value is TempolimitSegment {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.km_von === "number" &&
    typeof s.km_bis === "number" &&
    typeof s.kmh === "number" &&
    typeof s.bekannt === "boolean" &&
    Number.isFinite(s.km_von) &&
    Number.isFinite(s.km_bis) &&
    Number.isInteger(s.kmh) &&
    s.kmh >= MIN_EINGABE_KMH &&
    s.kmh <= MAX_EINGABE_KMH &&
    s.km_von >= 0 &&
    s.km_bis >= s.km_von
  );
}
