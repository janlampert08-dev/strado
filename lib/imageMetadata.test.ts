import { describe, expect, it } from "vitest";
import { metadatenEntfernen } from "@/lib/imageMetadata";

// Alle Fixtures werden hier als Byte-Arrays gebaut — keine Binärdateien im
// Repo, und die Struktur, gegen die getestet wird, steht direkt daneben.

function bytes(...werte: number[]): Uint8Array {
  return Uint8Array.from(werte);
}

function alsArray(u8: Uint8Array): number[] {
  return Array.from(u8);
}

function indexVon(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let k = 0; k < needle.length; k++) {
      if (haystack[i + k] !== needle[k]) continue outer;
    }
    return i;
  }
  return -1;
}

// --- JPEG ------------------------------------------------------------

function jpegSegment(marker: number, payload: number[]): number[] {
  const laenge = payload.length + 2;
  return [0xff, marker, (laenge >> 8) & 0xff, laenge & 0xff, ...payload];
}

const APP0_JFIF = jpegSegment(
  0xe0,
  [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00],
);
// "Exif\0\0" plus etwas Füllung, die für GPS-Tags steht.
const APP1_EXIF = jpegSegment(
  0xe1,
  [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x47, 0x50, 0x53],
);
// --- Exif-Fixtures ---------------------------------------------------

const EXIF_PRAEFIX = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
// Erkennbare "GPS-Nutzlast": darf im Ergebnis nirgends mehr auftauchen.
const GPS_NADEL = [0x47, 0x50, 0x53, 0x44, 0x41, 0x54, 0x41]; // "GPSDATA"

function u16(wert: number, le: boolean): number[] {
  return le ? [wert & 0xff, (wert >>> 8) & 0xff] : [(wert >>> 8) & 0xff, wert & 0xff];
}

function u32(wert: number, le: boolean): number[] {
  return le
    ? [wert & 0xff, (wert >>> 8) & 0xff, (wert >>> 16) & 0xff, (wert >>> 24) & 0xff]
    : [(wert >>> 24) & 0xff, (wert >>> 16) & 0xff, (wert >>> 8) & 0xff, wert & 0xff];
}

interface IfdEintrag {
  tag: number;
  typ: number;
  anzahl: number;
  wert: number[]; // exakt 4 Bytes
}

// Baut den Inhalt eines Exif-APP1: Kennung, TIFF-Header, IFD0 und einen
// frei wählbaren Anhang hinter dem IFD (dort landet die GPS-Nutzlast).
function exifNutzlast(le: boolean, eintraege: IfdEintrag[], anhang: number[] = []): number[] {
  const kopf = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(0x2a, le), ...u32(8, le)];
  const ifd = [
    ...u16(eintraege.length, le),
    ...eintraege.flatMap((e) => [
      ...u16(e.tag, le),
      ...u16(e.typ, le),
      ...u32(e.anzahl, le),
      ...e.wert,
    ]),
    ...u32(0, le), // kein weiteres IFD
  ];
  return [...EXIF_PRAEFIX, ...kopf, ...ifd, ...anhang];
}

function orientierungsEintrag(wert: number, le: boolean): IfdEintrag {
  return { tag: 0x0112, typ: 3, anzahl: 1, wert: [...u16(wert, le), 0x00, 0x00] };
}

// Exif, wie es ein Handy liefert: Ausrichtung plus ein GPS-IFD-Zeiger, der
// auf eine Nutzlast hinter IFD0 verweist.
function exifMitGps(orientierung: number, le: boolean): number[] {
  // IFD0 liegt bei Offset 8, ist 2 + 2*12 + 4 = 30 Bytes lang; der Anhang
  // beginnt also bei 38 (alles relativ zum TIFF-Header).
  const gpsOffset = 38;
  const eintraege: IfdEintrag[] = [
    orientierungsEintrag(orientierung, le),
    { tag: 0x8825, typ: 4, anzahl: 1, wert: u32(gpsOffset, le) },
  ];
  const gpsIfd = [
    ...u16(1, le),
    ...u16(0x0002, le), // GPSLatitude
    ...u16(2, le),
    ...u32(GPS_NADEL.length, le),
    ...u32(gpsOffset + 18, le),
    ...u32(0, le),
    ...GPS_NADEL,
  ];
  return exifNutzlast(le, eintraege, gpsIfd);
}

function exifApp1(nutzlast: number[]): number[] {
  return jpegSegment(0xe1, nutzlast);
}

// Liest die Ausrichtung aus dem ersten APP1 vor dem Scan zurück.
function orientierungAusErgebnis(ergebnis: Uint8Array): number | null {
  const sos = indexVon(ergebnis, SOS_HEADER);
  const kopf = ergebnis.subarray(0, sos === -1 ? ergebnis.length : sos);
  const start = indexVon(kopf, [0xff, 0xe1]);
  if (start === -1) return null;
  const daten = kopf.subarray(start + 4);
  const tiff = EXIF_PRAEFIX.length;
  const le = daten[tiff] === 0x49;
  const ifd = tiff + (le ? daten[tiff + 4] : daten[tiff + 7]);
  const anzahl = le ? daten[ifd] : daten[ifd + 1];
  for (let k = 0; k < anzahl; k++) {
    const e = ifd + 2 + k * 12;
    const tag = le ? daten[e] + daten[e + 1] * 0x100 : daten[e] * 0x100 + daten[e + 1];
    if (tag === 0x0112) {
      return le ? daten[e + 8] + daten[e + 9] * 0x100 : daten[e + 8] * 0x100 + daten[e + 9];
    }
  }
  return null;
}

const COM = jpegSegment(0xfe, [0x68, 0x69]);
const DQT = jpegSegment(0xdb, [0x00, 0x10, 0x20, 0x30]);
const SOF0 = jpegSegment(0xc0, [0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00]);
const SOS_HEADER = jpegSegment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
// Enthält absichtlich ein gestopftes 0xFF00, einen Restart-Marker und eine
// Bytefolge, die wie ein APP1-Segment aussieht: nach SOS darf nichts davon
// als Marker interpretiert werden.
const ENTROPIE = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xe1, 0x00, 0x04, 0xaa, 0xbb];
const EOI = [0xff, 0xd9];

const JPEG_MIT_METADATEN = bytes(
  0xff, 0xd8,
  ...APP0_JFIF,
  ...APP1_EXIF,
  ...COM,
  ...DQT,
  ...SOF0,
  ...SOS_HEADER,
  ...ENTROPIE,
  ...EOI,
);

const JPEG_OHNE_METADATEN = bytes(
  0xff, 0xd8,
  ...APP0_JFIF,
  ...DQT,
  ...SOF0,
  ...SOS_HEADER,
  ...ENTROPIE,
  ...EOI,
);

describe("metadatenEntfernen — JPEG", () => {
  it("removes the APP1/Exif segment", () => {
    const ergebnis = metadatenEntfernen(JPEG_MIT_METADATEN, "image/jpeg");
    expect(indexVon(JPEG_MIT_METADATEN, APP1_EXIF)).toBeGreaterThan(-1);
    expect(indexVon(ergebnis, APP1_EXIF)).toBe(-1);
    // Nur bis SOS prüfen: die Entropiedaten enthalten absichtlich eine
    // 0xFFE1-Folge, die kein Marker ist und stehen bleiben muss.
    const sos = indexVon(ergebnis, SOS_HEADER);
    expect(indexVon(ergebnis.subarray(0, sos), [0xff, 0xe1])).toBe(-1);
  });

  it("removes COM comments but keeps APP0/JFIF, DQT and SOF", () => {
    const ergebnis = metadatenEntfernen(JPEG_MIT_METADATEN, "image/jpeg");
    expect(indexVon(ergebnis, COM)).toBe(-1);
    expect(indexVon(ergebnis, APP0_JFIF)).toBeGreaterThan(-1);
    expect(indexVon(ergebnis, DQT)).toBeGreaterThan(-1);
    expect(indexVon(ergebnis, SOF0)).toBeGreaterThan(-1);
  });

  it("keeps the scan data byte-identical", () => {
    const ergebnis = metadatenEntfernen(JPEG_MIT_METADATEN, "image/jpeg");
    const vorher = indexVon(JPEG_MIT_METADATEN, SOS_HEADER);
    const nachher = indexVon(ergebnis, SOS_HEADER);
    expect(vorher).toBeGreaterThan(-1);
    expect(nachher).toBeGreaterThan(-1);
    expect(alsArray(ergebnis.subarray(nachher))).toEqual(
      alsArray(JPEG_MIT_METADATEN.subarray(vorher)),
    );
  });

  it("still starts with FFD8 and ends with FFD9", () => {
    const ergebnis = metadatenEntfernen(JPEG_MIT_METADATEN, "image/jpeg");
    expect(alsArray(ergebnis.subarray(0, 2))).toEqual([0xff, 0xd8]);
    expect(alsArray(ergebnis.subarray(ergebnis.length - 2))).toEqual([0xff, 0xd9]);
    expect(ergebnis.length).toBe(JPEG_MIT_METADATEN.length - APP1_EXIF.length - COM.length);
  });

  it("leaves a JPEG without metadata untouched", () => {
    const ergebnis = metadatenEntfernen(JPEG_OHNE_METADATEN, "image/jpeg");
    expect(alsArray(ergebnis)).toEqual(alsArray(JPEG_OHNE_METADATEN));
  });

  it("returns truncated or garbage JPEG input unchanged", () => {
    const abgeschnitten = JPEG_MIT_METADATEN.subarray(0, 20);
    expect(alsArray(metadatenEntfernen(abgeschnitten, "image/jpeg"))).toEqual(
      alsArray(abgeschnitten),
    );

    // Längenfeld verspricht mehr Bytes, als die Datei hat.
    const kaputteLaenge = bytes(0xff, 0xd8, 0xff, 0xe1, 0x7f, 0xff, 0x01, 0x02);
    expect(alsArray(metadatenEntfernen(kaputteLaenge, "image/jpeg"))).toEqual(
      alsArray(kaputteLaenge),
    );

    const muell = bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
    expect(alsArray(metadatenEntfernen(muell, "image/jpeg"))).toEqual(alsArray(muell));
    expect(alsArray(metadatenEntfernen(bytes(), "image/jpeg"))).toEqual([]);
  });
});

// --- JPEG: Ausrichtung ------------------------------------------------

// Baut ein vollständiges JPEG mit dem übergebenen APP1-Segment.
function jpegMitApp1(app1: number[]): Uint8Array {
  return bytes(
    0xff, 0xd8,
    ...APP0_JFIF,
    ...app1,
    ...DQT,
    ...SOF0,
    ...SOS_HEADER,
    ...ENTROPIE,
    ...EOI,
  );
}

function scanIstUnveraendert(ergebnis: Uint8Array, original: Uint8Array): boolean {
  const a = indexVon(ergebnis, SOS_HEADER);
  const b = indexVon(original, SOS_HEADER);
  if (a === -1 || b === -1) return false;
  return alsArray(ergebnis.subarray(a)).join() === alsArray(original.subarray(b)).join();
}

describe("metadatenEntfernen — JPEG-Ausrichtung", () => {
  it("keeps orientation 6 while dropping the GPS payload around it", () => {
    const app1 = exifApp1(exifMitGps(6, true));
    const eingabe = jpegMitApp1(app1);
    const ergebnis = metadatenEntfernen(eingabe, "image/jpeg");

    expect(orientierungAusErgebnis(ergebnis)).toBe(6);
    // Das Original enthielt die GPS-Nutzlast, das Ergebnis nirgends mehr.
    expect(indexVon(eingabe, GPS_NADEL)).toBeGreaterThan(-1);
    expect(indexVon(ergebnis, GPS_NADEL)).toBe(-1);
    expect(scanIstUnveraendert(ergebnis, eingabe)).toBe(true);
  });

  it("replaces the original APP1 with a materially smaller synthesised block", () => {
    const app1 = exifApp1(exifMitGps(6, true));
    const ergebnis = metadatenEntfernen(jpegMitApp1(app1), "image/jpeg");

    const start = indexVon(ergebnis, [0xff, 0xe1]);
    expect(start).toBeGreaterThan(-1);
    const laenge = 2 + (ergebnis[start + 2] << 8) + ergebnis[start + 3];
    expect(laenge).toBe(36);
    expect(laenge).toBeLessThan(app1.length);

    // Kanonische Form, Byte für Byte.
    expect(alsArray(ergebnis.subarray(start, start + 36))).toEqual([
      0xff, 0xe1, 0x00, 0x22,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49, 0x2a, 0x00,
      0x08, 0x00, 0x00, 0x00,
      0x01, 0x00,
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
      0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
  });

  it("reads big-endian (MM) Exif correctly", () => {
    const ergebnis = metadatenEntfernen(
      jpegMitApp1(exifApp1(exifMitGps(8, false))),
      "image/jpeg",
    );
    expect(orientierungAusErgebnis(ergebnis)).toBe(8);
    expect(indexVon(ergebnis, GPS_NADEL)).toBe(-1);
  });

  it("emits no APP1 at all for orientation 1", () => {
    const eingabe = jpegMitApp1(exifApp1(exifMitGps(1, true)));
    const ergebnis = metadatenEntfernen(eingabe, "image/jpeg");
    const sos = indexVon(ergebnis, SOS_HEADER);
    expect(indexVon(ergebnis.subarray(0, sos), [0xff, 0xe1])).toBe(-1);
    expect(scanIstUnveraendert(ergebnis, eingabe)).toBe(true);
  });

  it("emits no APP1 when Exif carries no orientation tag", () => {
    const ohneTag = exifNutzlast(true, [
      { tag: 0x010f, typ: 2, anzahl: 4, wert: [0x41, 0x43, 0x4d, 0x00] }, // Make
    ]);
    const ergebnis = metadatenEntfernen(jpegMitApp1(exifApp1(ohneTag)), "image/jpeg");
    const sos = indexVon(ergebnis, SOS_HEADER);
    expect(indexVon(ergebnis.subarray(0, sos), [0xff, 0xe1])).toBe(-1);
  });

  it("drops XMP APP1 segments without trying to read them", () => {
    const xmp = [...[..."http://ns.adobe.com/xap/1.0/\0"].map((c) => c.charCodeAt(0)), 0x3c, 0x78];
    const ergebnis = metadatenEntfernen(jpegMitApp1(exifApp1(xmp)), "image/jpeg");
    const sos = indexVon(ergebnis, SOS_HEADER);
    expect(indexVon(ergebnis.subarray(0, sos), [0xff, 0xe1])).toBe(-1);
  });

  it("drops a truncated or garbage Exif block and keeps the image intact", () => {
    const faelle: number[][] = [
      [...EXIF_PRAEFIX], // nur die Kennung, kein TIFF-Header
      [...EXIF_PRAEFIX, 0x49, 0x49, 0x2a, 0x00], // Header abgeschnitten
      [...EXIF_PRAEFIX, 0x58, 0x58, 0x2a, 0x00, 0x08, 0, 0, 0], // falsche Byteorder
      [...EXIF_PRAEFIX, 0x49, 0x49, 0x99, 0x99, 0x08, 0, 0, 0], // falsches Magic
      // IFD-Offset zeigt über das Segmentende hinaus
      [...EXIF_PRAEFIX, 0x49, 0x49, 0x2a, 0x00, 0xf0, 0, 0, 0],
      // Eintragszahl verspricht mehr Einträge, als der Block hergibt
      [...EXIF_PRAEFIX, 0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0, 0xff, 0x00],
      [0xde, 0xad, 0xbe, 0xef], // gar kein Exif
    ];

    for (const fall of faelle) {
      const eingabe = jpegMitApp1(exifApp1(fall));
      const ergebnis = metadatenEntfernen(eingabe, "image/jpeg");
      const sos = indexVon(ergebnis, SOS_HEADER);
      expect(indexVon(ergebnis.subarray(0, sos), [0xff, 0xe1])).toBe(-1);
      expect(scanIstUnveraendert(ergebnis, eingabe)).toBe(true);
      expect(alsArray(ergebnis.subarray(0, 2))).toEqual([0xff, 0xd8]);
      expect(alsArray(ergebnis.subarray(ergebnis.length - 2))).toEqual([0xff, 0xd9]);
    }
  });

  it("uses only the first usable Exif block and drops any further APP1", () => {
    const eingabe = bytes(
      0xff, 0xd8,
      ...APP0_JFIF,
      ...exifApp1(exifMitGps(6, true)),
      ...exifApp1(exifMitGps(3, true)),
      ...DQT,
      ...SOF0,
      ...SOS_HEADER,
      ...ENTROPIE,
      ...EOI,
    );
    const ergebnis = metadatenEntfernen(eingabe, "image/jpeg");
    expect(orientierungAusErgebnis(ergebnis)).toBe(6);
    const sos = indexVon(ergebnis, SOS_HEADER);
    const kopf = ergebnis.subarray(0, sos);
    // Genau ein APP1 im Ergebnis.
    const erstes = indexVon(kopf, [0xff, 0xe1]);
    expect(indexVon(kopf.subarray(erstes + 2), [0xff, 0xe1])).toBe(-1);
  });
});

// --- PNG -------------------------------------------------------------

const CRC_TABELLE = (() => {
  const tabelle = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabelle[n] = c >>> 0;
  }
  return tabelle;
})();

function crc32(daten: number[]): number {
  let c = 0xffffffff;
  for (const b of daten) c = CRC_TABELLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function uint32BE(wert: number): number[] {
  return [(wert >>> 24) & 0xff, (wert >>> 16) & 0xff, (wert >>> 8) & 0xff, wert & 0xff];
}

function pngChunk(typ: string, daten: number[]): number[] {
  const koerper = [...[...typ].map((c) => c.charCodeAt(0)), ...daten];
  return [...uint32BE(daten.length), ...koerper, ...uint32BE(crc32(koerper))];
}

const PNG_SIGNATUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const EXIF_CHUNK = pngChunk("eXIf", [0x4d, 0x4d, 0x00, 0x2a, 0x47, 0x50, 0x53]);
const TEXT_CHUNK = pngChunk("tEXt", [0x4b, 0x65, 0x79, 0x00, 0x56, 0x61, 0x6c]);
const ZTXT_CHUNK = pngChunk("zTXt", [0x4b, 0x00, 0x00, 0x78, 0x9c]);
const ITXT_CHUNK = pngChunk("iTXt", [0x4b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x41]);
const TIME_CHUNK = pngChunk("tIME", [0x07, 0xe9, 0x01, 0x02, 0x03, 0x04, 0x05]);
const IDAT = pngChunk("IDAT", [0x78, 0x9c, 0x62, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
const IEND = pngChunk("IEND", []);

const PNG_MIT_METADATEN = bytes(
  ...PNG_SIGNATUR,
  ...IHDR,
  ...EXIF_CHUNK,
  ...TEXT_CHUNK,
  ...ZTXT_CHUNK,
  ...ITXT_CHUNK,
  ...TIME_CHUNK,
  ...IDAT,
  ...IEND,
);

describe("metadatenEntfernen — PNG", () => {
  it("removes eXIf and tEXt chunks", () => {
    const ergebnis = metadatenEntfernen(PNG_MIT_METADATEN, "image/png");
    expect(indexVon(PNG_MIT_METADATEN, EXIF_CHUNK)).toBeGreaterThan(-1);
    expect(indexVon(ergebnis, EXIF_CHUNK)).toBe(-1);
    expect(indexVon(ergebnis, TEXT_CHUNK)).toBe(-1);
  });

  it("removes zTXt, iTXt and tIME as well", () => {
    const ergebnis = metadatenEntfernen(PNG_MIT_METADATEN, "image/png");
    expect(indexVon(ergebnis, ZTXT_CHUNK)).toBe(-1);
    expect(indexVon(ergebnis, ITXT_CHUNK)).toBe(-1);
    expect(indexVon(ergebnis, TIME_CHUNK)).toBe(-1);
  });

  it("keeps signature, IHDR, IDAT and IEND byte-identical", () => {
    const ergebnis = metadatenEntfernen(PNG_MIT_METADATEN, "image/png");
    expect(alsArray(ergebnis)).toEqual([...PNG_SIGNATUR, ...IHDR, ...IDAT, ...IEND]);
  });

  it("leaves a PNG without metadata untouched", () => {
    const sauber = bytes(...PNG_SIGNATUR, ...IHDR, ...IDAT, ...IEND);
    expect(alsArray(metadatenEntfernen(sauber, "image/png"))).toEqual(alsArray(sauber));
  });

  it("returns truncated or garbage PNG input unchanged", () => {
    const abgeschnitten = PNG_MIT_METADATEN.subarray(0, 30);
    expect(alsArray(metadatenEntfernen(abgeschnitten, "image/png"))).toEqual(
      alsArray(abgeschnitten),
    );

    // Gültige Signatur, danach Müll statt eines Chunk-Headers.
    const kaputt = bytes(...PNG_SIGNATUR, 0xff, 0xff, 0xff, 0xff, 0x01, 0x02, 0x03, 0x04);
    expect(alsArray(metadatenEntfernen(kaputt, "image/png"))).toEqual(alsArray(kaputt));

    // Kein IEND: Datei bricht mitten im Strom ab.
    const ohneEnde = bytes(...PNG_SIGNATUR, ...IHDR, ...EXIF_CHUNK);
    expect(alsArray(metadatenEntfernen(ohneEnde, "image/png"))).toEqual(alsArray(ohneEnde));

    const muell = bytes(9, 8, 7, 6, 5, 4, 3, 2, 1);
    expect(alsArray(metadatenEntfernen(muell, "image/png"))).toEqual(alsArray(muell));
  });
});

// --- WebP ------------------------------------------------------------

function uint32LE(wert: number): number[] {
  return [wert & 0xff, (wert >>> 8) & 0xff, (wert >>> 16) & 0xff, (wert >>> 24) & 0xff];
}

function riffChunk(typ: string, daten: number[]): number[] {
  const gepolstert = daten.length % 2 === 1 ? [...daten, 0x00] : daten;
  return [...[...typ].map((c) => c.charCodeAt(0)), ...uint32LE(daten.length), ...gepolstert];
}

function riffDatei(chunks: number[][]): Uint8Array {
  const nutzlast = chunks.flat();
  return bytes(
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    ...uint32LE(4 + nutzlast.length),
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    ...nutzlast,
  );
}

// Ungerade Nutzlast: prüft, dass die RIFF-Polsterung richtig übersprungen
// wird und die nachfolgenden Chunks nicht verrutschen.
const VP8_CHUNK = riffChunk("VP8 ", [0x01, 0x02, 0x03, 0x04, 0x05]);
const WEBP_EXIF = riffChunk("EXIF", [0x4d, 0x4d, 0x00, 0x2a, 0x47, 0x50, 0x53]);
const WEBP_XMP = riffChunk("XMP ", [0x3c, 0x78, 0x3a, 0x78]);

const WEBP_MIT_EXIF = riffDatei([VP8_CHUNK, WEBP_EXIF, WEBP_XMP]);

function riffGroesse(u8: Uint8Array): number {
  return u8[4] + u8[5] * 0x100 + u8[6] * 0x10000 + u8[7] * 0x1000000;
}

describe("metadatenEntfernen — WebP", () => {
  it("removes the EXIF and XMP chunks and keeps the image chunk", () => {
    const ergebnis = metadatenEntfernen(WEBP_MIT_EXIF, "image/webp");
    expect(indexVon(WEBP_MIT_EXIF, WEBP_EXIF)).toBeGreaterThan(-1);
    expect(indexVon(ergebnis, WEBP_EXIF)).toBe(-1);
    expect(indexVon(ergebnis, WEBP_XMP)).toBe(-1);
    expect(indexVon(ergebnis, VP8_CHUNK)).toBeGreaterThan(-1);
  });

  it("updates the RIFF size field to match the new length", () => {
    const ergebnis = metadatenEntfernen(WEBP_MIT_EXIF, "image/webp");
    expect(riffGroesse(WEBP_MIT_EXIF)).toBe(WEBP_MIT_EXIF.length - 8);
    expect(riffGroesse(ergebnis)).toBe(ergebnis.length - 8);
    expect(ergebnis.length).toBe(WEBP_MIT_EXIF.length - WEBP_EXIF.length - WEBP_XMP.length);
    expect(alsArray(ergebnis)).toEqual(alsArray(riffDatei([VP8_CHUNK])));
  });

  it("clears the EXIF/XMP flags in a VP8X header", () => {
    // Flags-Byte 0x2c = ICC | EXIF | XMP.
    const vp8x = riffChunk("VP8X", [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const datei = riffDatei([vp8x, VP8_CHUNK, WEBP_EXIF]);
    const ergebnis = metadatenEntfernen(datei, "image/webp");
    // VP8X liegt direkt hinter dem 12-Byte-Header, Flags sind sein erstes
    // Datenbyte (12 + 8).
    expect(ergebnis[20]).toBe(0x20);
    expect(indexVon(ergebnis, WEBP_EXIF)).toBe(-1);
  });

  it("leaves a WebP without metadata untouched", () => {
    const sauber = riffDatei([VP8_CHUNK]);
    expect(alsArray(metadatenEntfernen(sauber, "image/webp"))).toEqual(alsArray(sauber));
  });

  it("returns truncated or garbage WebP input unchanged", () => {
    const abgeschnitten = WEBP_MIT_EXIF.subarray(0, 16);
    expect(alsArray(metadatenEntfernen(abgeschnitten, "image/webp"))).toEqual(
      alsArray(abgeschnitten),
    );

    // Chunk-Länge zeigt über das Dateiende hinaus.
    const kaputt = riffDatei([[...[..."EXIF"].map((c) => c.charCodeAt(0)), ...uint32LE(9999)]]);
    expect(alsArray(metadatenEntfernen(kaputt, "image/webp"))).toEqual(alsArray(kaputt));

    const muell = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3);
    expect(alsArray(metadatenEntfernen(muell, "image/webp"))).toEqual(alsArray(muell));
  });
});

// --- GIF und unbekannte Typen ----------------------------------------

describe("metadatenEntfernen — GIF und unbekannte Typen", () => {
  const GIF = bytes(
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
    0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    0x3b, // Trailer
  );

  it("returns a GIF unchanged", () => {
    expect(metadatenEntfernen(GIF, "image/gif")).toBe(GIF);
  });

  it("returns truncated GIF input unchanged", () => {
    const abgeschnitten = GIF.subarray(0, 3);
    expect(metadatenEntfernen(abgeschnitten, "image/gif")).toBe(abgeschnitten);
  });

  it("returns unknown MIME types unchanged", () => {
    expect(metadatenEntfernen(JPEG_MIT_METADATEN, "image/svg+xml")).toBe(JPEG_MIT_METADATEN);
    expect(metadatenEntfernen(JPEG_MIT_METADATEN, "application/pdf")).toBe(JPEG_MIT_METADATEN);
    expect(metadatenEntfernen(JPEG_MIT_METADATEN, "")).toBe(JPEG_MIT_METADATEN);
  });

  it("normalises the content type before dispatching", () => {
    const ergebnis = metadatenEntfernen(JPEG_MIT_METADATEN, "IMAGE/JPEG; charset=binary");
    expect(indexVon(ergebnis, APP1_EXIF)).toBe(-1);
  });
});
