// Entfernt Metadaten aus hochgeladenen Bildern, bevor sie in den Storage
// gelangen (route-photos, avatars — siehe 0033_route_length_and_upload_mime_
// hardening.sql für die erlaubten MIME-Typen).
//
// Warum überhaupt: Kameras und Smartphones schreiben EXIF in die Datei —
// darunter GPS-Koordinaten und den Aufnahmezeitpunkt. Auf einer Plattform,
// auf der Fotos an öffentlich sichtbare Fahrten hängen, ist das ein echtes
// Datenleck: ein Bild, das zu Hause aufgenommen wurde, trägt die
// Wohnadresse mit sich, und die Buckets liefern die Datei unverändert
// wieder aus.
//
// Warum ohne Abhängigkeit: Bibliotheken wie sharp würden das Bild neu
// kodieren — das kostet Qualität und CPU auf jedem Upload, obwohl gar keine
// Pixel verändert werden sollen. Hier wird stattdessen nur der Container neu
// zusammengesetzt; die eigentlichen Bilddaten werden Byte für Byte
// übernommen.
//
// Grundsatz für alles Folgende: Diese Funktion läuft auf jedem Upload und
// darf niemals werfen und niemals eine kaputte Datei zurückgeben. Sobald
// eine Struktur nicht dem entspricht, was das Format vorschreibt (abge-
// schnittene Datei, falsch deklarierter Typ, Müll), wird die Eingabe
// unverändert zurückgegeben. Lieber Metadaten behalten als ein zerstörtes
// Bild speichern.

// JPEG-Marker ohne Längenfeld: SOI, EOI, TEM und die acht Restart-Marker.
function istMarkerOhneLaenge(marker: number): boolean {
  return marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

// APP1 (Exif/XMP) bis APP15 sowie COM-Kommentare fliegen raus. APP0 (JFIF)
// bleibt bewusst drin: das Segment trägt keine personenbezogenen Daten,
// aber manche Decoder erwarten es — es zu entfernen brächte nichts und
// riskierte nur Kompatibilitätsprobleme.
function istJpegMetadatenSegment(marker: number): boolean {
  return (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
}

// "Exif\0\0" — Kennung, mit der ein APP1-Segment als Exif-Block beginnt.
// APP1 kann auch XMP tragen, das fängt stattdessen mit einer Namespace-URI
// an und wird hier folgerichtig nicht gelesen, sondern nur verworfen.
const EXIF_PRAEFIX = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const TAG_ORIENTIERUNG = 0x0112;
const TYP_SHORT = 3;

function leseUint16(b: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? b[offset] + b[offset + 1] * 0x100
    : b[offset] * 0x100 + b[offset + 1];
}

function leseUint32(b: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? b[offset] +
        b[offset + 1] * 0x100 +
        b[offset + 2] * 0x10000 +
        b[offset + 3] * 0x1000000
    : b[offset] * 0x1000000 +
        b[offset + 1] * 0x10000 +
        b[offset + 2] * 0x100 +
        b[offset + 3];
}

// Liest ausschliesslich die Ausrichtung (IFD0, Tag 0x0112) aus einem
// Exif-Block. Alles andere im Block wird bewusst nicht angefasst.
//
// Warum überhaupt: Handykameras speichern das Bild in der Ausrichtung des
// Sensors und überlassen es dem Betrachter, es anhand dieses Tags zu
// drehen — Browser tun das von sich aus. Fällt das Tag ersatzlos weg,
// liegt ein Grossteil der Handyfotos hinterher quer. Der Tag selbst ist
// nicht personenbezogen: er sagt nur, wie herum das Bild gehört.
//
// `daten` ist der Segmentinhalt ohne Marker und Längenfeld, beginnt also
// mit "Exif\0\0". Rückgabe null heisst: nichts Verwertbares gefunden —
// dann wird das Segment wie jedes andere ersatzlos verworfen.
function orientierungAusExif(daten: Uint8Array): number | null {
  // Kennung + TIFF-Header sind das Minimum, ohne das nichts geht.
  if (daten.length < EXIF_PRAEFIX.length + 8) return null;
  for (let k = 0; k < EXIF_PRAEFIX.length; k++) {
    if (daten[k] !== EXIF_PRAEFIX[k]) return null;
  }

  // Alle Offsets im Exif zählen ab dem Anfang des TIFF-Headers, nicht ab
  // dem Segmentanfang.
  const tiff = EXIF_PRAEFIX.length;
  const b0 = daten[tiff];
  const b1 = daten[tiff + 1];
  let littleEndian: boolean;
  if (b0 === 0x49 && b1 === 0x49) littleEndian = true; // "II"
  else if (b0 === 0x4d && b1 === 0x4d) littleEndian = false; // "MM"
  else return null;

  if (leseUint16(daten, tiff + 2, littleEndian) !== 0x002a) return null;

  const ifdOffset = leseUint32(daten, tiff + 4, littleEndian);
  // Vor dem Ende des TIFF-Headers kann kein IFD liegen.
  if (ifdOffset < 8) return null;
  const ifd = tiff + ifdOffset;
  if (ifd + 2 > daten.length) return null;

  const anzahl = leseUint16(daten, ifd, littleEndian);
  // Jeder Eintrag ist 12 Bytes; passen sie nicht mehr in den Block, ist er
  // abgeschnitten.
  if (ifd + 2 + anzahl * 12 > daten.length) return null;

  for (let k = 0; k < anzahl; k++) {
    const eintrag = ifd + 2 + k * 12;
    if (leseUint16(daten, eintrag, littleEndian) !== TAG_ORIENTIERUNG) continue;
    if (leseUint16(daten, eintrag + 2, littleEndian) !== TYP_SHORT) return null;
    if (leseUint32(daten, eintrag + 4, littleEndian) !== 1) return null;
    // Ein einzelner SHORT passt in das 4-Byte-Wertfeld und steht dort in
    // dessen ersten beiden Bytes.
    const wert = leseUint16(daten, eintrag + 8, littleEndian);
    return wert >= 1 && wert <= 8 ? wert : null;
  }
  return null;
}

// Baut ein frisches, minimales Exif-APP1 mit genau einem Tag.
//
// Entscheidend fürs Datenschutzversprechen: Das Original wird nicht
// weitergereicht, sondern verworfen und durch diesen selbst erzeugten Block
// ersetzt. Weil hier nur Bytes stehen, die diese Funktion selbst schreibt,
// kann nichts durchrutschen — keine GPS-Koordinaten, kein Aufnahmedatum,
// kein Kameramodell, keine MakerNotes, kein eingebettetes Vorschaubild.
function exifOrientierungSegment(orientierung: number): Uint8Array {
  const nutzlast = [
    ...EXIF_PRAEFIX,
    0x49, 0x49, // "II" — little endian
    0x2a, 0x00, // TIFF-Magic 0x002A
    0x08, 0x00, 0x00, 0x00, // IFD0 beginnt direkt hinter dem Header
    0x01, 0x00, // genau ein Eintrag
    0x12, 0x01, // Tag 0x0112 (Orientation)
    0x03, 0x00, // Typ SHORT
    0x01, 0x00, 0x00, 0x00, // Anzahl 1
    orientierung & 0xff, 0x00, 0x00, 0x00, // Wert, Rest des Feldes null
    0x00, 0x00, 0x00, 0x00, // kein weiteres IFD
  ];
  // Das Längenfeld zählt sich selbst mit.
  const laenge = nutzlast.length + 2;
  return Uint8Array.from([0xff, 0xe1, (laenge >> 8) & 0xff, laenge & 0xff, ...nutzlast]);
}

function jpegBereinigen(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const teile: Uint8Array[] = [bytes.subarray(0, 2)];
  let entfernt = false;
  let abgeschlossen = false;
  // Nur das erste verwertbare APP1 liefert die Ausrichtung; weitere
  // Exif-Blöcke werden wie alles andere verworfen.
  let orientierung: number | null = null;
  let i = 2;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;

    // Vor einem Marker dürfen beliebig viele 0xFF-Füllbytes stehen.
    let m = i + 1;
    while (m < bytes.length && bytes[m] === 0xff) m++;
    if (m >= bytes.length) return null;

    const marker = bytes[m];
    // 0xFF00 ist ein gestopftes Datenbyte und darf ausserhalb der
    // Entropiedaten nicht auftreten — dann stimmt unsere Position nicht.
    if (marker === 0x00) return null;

    if (marker === 0xd9) {
      // EOI: ab hier gehört nichts mehr zum Markerstrom, der Rest wird
      // unverändert übernommen.
      teile.push(bytes.subarray(i));
      abgeschlossen = true;
      break;
    }

    if (istMarkerOhneLaenge(marker)) {
      teile.push(bytes.subarray(i, m + 1));
      i = m + 1;
      continue;
    }

    if (m + 3 > bytes.length) return null;
    const laenge = (bytes[m + 1] << 8) | bytes[m + 2];
    // Das Längenfeld zählt sich selbst mit, weniger als 2 ist unmöglich.
    if (laenge < 2) return null;
    const ende = m + 1 + laenge;
    if (ende > bytes.length) return null;

    if (marker === 0xda) {
      // SOS: ab hier folgen die entropiekodierten Bilddaten, in denen 0xFF
      // als Datenbyte vorkommt. Darin nach Markern zu suchen würde die
      // Datei zerlegen — deshalb wird der gesamte Rest einschliesslich
      // SOS-Header unverändert kopiert.
      teile.push(bytes.subarray(i));
      abgeschlossen = true;
      break;
    }

    if (istJpegMetadatenSegment(marker)) {
      // Das Original fliegt in jedem Fall raus. Trägt es eine verwertbare
      // Ausrichtung, tritt an seine Stelle ein neu gebauter Block, der
      // nichts als diese Ausrichtung enthält. Orientierung 1 ist die
      // Normallage — dafür braucht es gar kein Segment.
      if (marker === 0xe1 && orientierung === null) {
        const gelesen = orientierungAusExif(bytes.subarray(m + 3, ende));
        if (gelesen !== null && gelesen !== 1) {
          orientierung = gelesen;
          teile.push(exifOrientierungSegment(gelesen));
        }
      }
      entfernt = true;
    } else {
      teile.push(bytes.subarray(i, ende));
    }
    i = ende;
  }

  // Ohne SOS oder EOI ist die Datei abgeschnitten: nichts anfassen.
  if (!abgeschlossen) return null;
  if (!entfernt) return bytes;
  return zusammenfuegen(teile);
}

const PNG_SIGNATUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Textuelle und zeitliche Zusatz-Chunks. Alles andere (IHDR, PLTE, IDAT,
// IEND, Farbprofile, …) bleibt unangetastet — und weil die Chunks samt
// ihrer CRC wörtlich kopiert werden, bleiben die Prüfsummen gültig, ohne
// dass etwas neu berechnet werden müsste.
const PNG_ZU_ENTFERNEN = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

function pngBereinigen(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8) return null;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATUR[i]) return null;
  }

  const teile: Uint8Array[] = [bytes.subarray(0, 8)];
  let entfernt = false;
  let abgeschlossen = false;
  let i = 8;

  while (i < bytes.length) {
    // Länge (4) + Typ (4) + Daten + CRC (4)
    if (i + 8 > bytes.length) return null;
    const laenge =
      bytes[i] * 0x1000000 + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
    // Die PNG-Spezifikation begrenzt Chunk-Längen auf 2^31-1.
    if (laenge > 0x7fffffff) return null;

    let typ = "";
    for (let k = 0; k < 4; k++) {
      const c = bytes[i + 4 + k];
      // Chunk-Typen bestehen ausschliesslich aus ASCII-Buchstaben.
      if (!((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a))) return null;
      typ += String.fromCharCode(c);
    }

    const ende = i + 12 + laenge;
    if (ende > bytes.length) return null;

    if (typ === "IEND") {
      teile.push(bytes.subarray(i));
      abgeschlossen = true;
      break;
    }

    if (PNG_ZU_ENTFERNEN.has(typ)) {
      entfernt = true;
    } else {
      teile.push(bytes.subarray(i, ende));
    }
    i = ende;
  }

  if (!abgeschlossen) return null;
  if (!entfernt) return bytes;
  return zusammenfuegen(teile);
}

function viererCode(bytes: Uint8Array, offset: number): string {
  let s = "";
  for (let k = 0; k < 4; k++) s += String.fromCharCode(bytes[offset + k]);
  return s;
}

// VP8X-Flags: Bit 3 meldet einen EXIF-, Bit 2 einen XMP-Chunk. Wenn beide
// Chunks entfernt werden, müssen auch die Flags fallen — sonst kündigt der
// Header Daten an, die es nicht mehr gibt.
const VP8X_FLAG_EXIF = 0x08;
const VP8X_FLAG_XMP = 0x04;

function webpBereinigen(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12) return null;
  if (viererCode(bytes, 0) !== "RIFF" || viererCode(bytes, 8) !== "WEBP") return null;

  const riffGroesse = leseUint32(bytes, 4, true);
  // Das Grössenfeld zählt alles ab Byte 8. Verspricht es mehr, als die
  // Datei hergibt, ist sie abgeschnitten.
  if (riffGroesse < 4 || 8 + riffGroesse > bytes.length) return null;
  const ende = 8 + riffGroesse;

  const teile: Uint8Array[] = [];
  let entfernt = false;
  let i = 12;

  while (i < ende) {
    if (i + 8 > ende) return null;
    const typ = viererCode(bytes, i);
    const laenge = leseUint32(bytes, i + 4, true);
    // Ungerade Chunks werden auf gerade Länge aufgefüllt; das Füllbyte
    // gehört zum Chunk, zählt aber nicht zum Längenfeld.
    const gepolstert = laenge + (laenge % 2);
    const chunkEnde = i + 8 + gepolstert;
    if (chunkEnde > ende) return null;

    if (typ === "EXIF" || typ === "XMP ") {
      entfernt = true;
    } else if (typ === "VP8X" && laenge >= 1) {
      const kopie = bytes.slice(i, chunkEnde);
      const flags = kopie[8];
      const neu = flags & ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
      if (neu !== flags) {
        kopie[8] = neu;
        entfernt = true;
      }
      teile.push(kopie);
    } else {
      teile.push(bytes.subarray(i, chunkEnde));
    }
    i = chunkEnde;
  }

  if (!entfernt) return bytes;

  const nutzlast = zusammenfuegen(teile);
  const ergebnis = new Uint8Array(12 + nutzlast.length);
  ergebnis.set(bytes.subarray(0, 12), 0);
  // Grössenfeld auf die neue Länge korrigieren: alles ab Byte 8, also die
  // vier Bytes "WEBP" plus die verbliebenen Chunks.
  schreibeUint32LE(ergebnis, 4, 4 + nutzlast.length);
  ergebnis.set(nutzlast, 12);
  return ergebnis;
}

function schreibeUint32LE(bytes: Uint8Array, offset: number, wert: number): void {
  bytes[offset] = wert & 0xff;
  bytes[offset + 1] = (wert >>> 8) & 0xff;
  bytes[offset + 2] = (wert >>> 16) & 0xff;
  bytes[offset + 3] = (wert >>> 24) & 0xff;
}

function zusammenfuegen(teile: Uint8Array[]): Uint8Array {
  let laenge = 0;
  for (const teil of teile) laenge += teil.length;
  const ergebnis = new Uint8Array(laenge);
  let offset = 0;
  for (const teil of teile) {
    ergebnis.set(teil, offset);
    offset += teil.length;
  }
  return ergebnis;
}

/**
 * Entfernt Metadaten aus einem Bild, ohne die Bilddaten neu zu kodieren.
 *
 * - `image/jpeg`: APP1–APP15 (Exif, XMP) und COM-Kommentare fallen weg,
 *   APP0/JFIF sowie SOF/DQT/DHT/SOS und der gesamte Scan bleiben. Einzige
 *   Ausnahme ist die Exif-Ausrichtung (Tag 0x0112): sie wird ausgelesen und
 *   als neu gebautes, minimales APP1 wieder eingesetzt, damit Handyfotos
 *   nicht quer liegen — siehe exifOrientierungSegment.
 * - `image/png`: eXIf, tEXt, iTXt, zTXt und tIME fallen weg.
 * - `image/webp`: EXIF- und XMP-Chunks fallen weg, das RIFF-Grössenfeld
 *   wird korrigiert.
 * - `image/gif`: GIF kennt kein EXIF — unverändert zurück.
 * - Alles andere: unverändert zurück.
 *
 * Gibt bei unbekanntem Typ, unverändertem Bild oder unbrauchbarer Struktur
 * dieselbe Instanz zurück, die hereingereicht wurde.
 */
export function metadatenEntfernen(bytes: Uint8Array, mimeType: string): Uint8Array {
  // Content-Type kann Parameter tragen ("image/jpeg; charset=binary").
  const typ = mimeType.split(";")[0].trim().toLowerCase();

  try {
    let ergebnis: Uint8Array | null = null;
    if (typ === "image/jpeg") ergebnis = jpegBereinigen(bytes);
    else if (typ === "image/png") ergebnis = pngBereinigen(bytes);
    else if (typ === "image/webp") ergebnis = webpBereinigen(bytes);
    // image/gif und unbekannte Typen: nichts zu tun.
    return ergebnis ?? bytes;
  } catch {
    // Siehe Kopf der Datei: ein Upload darf hieran nicht scheitern.
    return bytes;
  }
}
