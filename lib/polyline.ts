// Google Encoded Polyline (https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
// für Streckenlinien. Rein und ohne Abhängigkeiten, weil beide Seiten es
// brauchen: der Endpunkt app/strecken/[id]/geometrie kodiert, die Karte im
// Browser dekodiert (lib/streckenGeometrie.ts).
//
// Koordinaten laufen hier wie überall in der App als GeoJSON-Paare
// [lng, lat]. Das Format selbst kodiert lat vor lng — die Vertauschung
// passiert ausschliesslich in diesem Modul.
//
// Präzision 5 heisst: auf 1e-5 Grad gerundet, also höchstens ~0.7 m
// Abweichung pro Punkt (in der Schweiz nachgemessen: 0.67 m über die ganze
// Albulapass-Linie). Für eine Kartenlinie, den GPX-Export und den
// Deckungsgrad-Vorschau (Korridor im Bereich von Dutzenden Metern) ist das
// unter jeder Wahrnehmungsschwelle. Massgeblich rechnet ohnehin der Server
// mit der exakten Geometrie aus der Datenbank.

export const POLYLINE_PRAEZISION = 5;

function kodiereZahl(wert: number): string {
  // Vorzeichen ins unterste Bit, dann in 5-Bit-Gruppen von unten nach oben.
  let v = wert < 0 ? ~(wert << 1) : wert << 1;
  let aus = "";
  while (v >= 0x20) {
    aus += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>>= 5;
  }
  return aus + String.fromCharCode(v + 63);
}

export function encodePolyline(
  koordinaten: readonly (readonly number[])[],
  praezision: number = POLYLINE_PRAEZISION,
): string {
  const faktor = 10 ** praezision;
  let vorLat = 0;
  let vorLng = 0;
  let aus = "";
  for (const punkt of koordinaten) {
    const lng = Math.round(punkt[0] * faktor);
    const lat = Math.round(punkt[1] * faktor);
    aus += kodiereZahl(lat - vorLat) + kodiereZahl(lng - vorLng);
    vorLat = lat;
    vorLng = lng;
  }
  return aus;
}

// Wirft bei einer abgeschnittenen oder fremden Zeichenkette, statt still
// eine halbe Linie zu liefern: eine falsch gezeichnete Strecke wäre
// schlimmer als die vereinfachte, auf die der Aufrufer dann zurückfällt.
export function decodePolyline(
  kodiert: string,
  praezision: number = POLYLINE_PRAEZISION,
): [number, number][] {
  const faktor = 10 ** praezision;
  const punkte: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  function leseZahl(): number {
    let ergebnis = 0;
    let verschiebung = 0;
    let byte: number;
    do {
      if (index >= kodiert.length) throw new Error("Polyline abgeschnitten");
      byte = kodiert.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 0x3f) throw new Error("Ungültiges Zeichen in Polyline");
      ergebnis |= (byte & 0x1f) << verschiebung;
      verschiebung += 5;
      // Mehr als 30 Bit passen nicht in eine Koordinate — ein Zeichen
      // ausserhalb des Schemas würde sonst endlos weiterschieben.
      if (verschiebung > 30) throw new Error("Polyline-Wert zu gross");
    } while (byte >= 0x20);
    return ergebnis & 1 ? ~(ergebnis >> 1) : ergebnis >> 1;
  }

  while (index < kodiert.length) {
    lat += leseZahl();
    lng += leseZahl();
    punkte.push([lng / faktor, lat / faktor]);
  }
  return punkte;
}
