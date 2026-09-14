#!/usr/bin/env node
// Erzeugt app/favicon.ico aus dem Signet in lib/marke.ts.
//
// Warum es dieses Skript gibt: app/favicon.ico ist die einzige Marke der App,
// die nicht zur Laufzeit aus lib/marke.ts gezeichnet wird, sondern als
// fertiges Bild im Repo liegt. Genau deshalb ist sie beim Wechsel des Signets
// zum Rundkurs (2026-09-14) zunaechst stehen geblieben: Favicon und App-Icon
// zeigten einen Tag lang zwei verschiedene Marken. Der Kopf der Seite liefert
// beide aus —
//
//   <link rel="icon" href="/favicon.ico" sizes="48x48">   <- diese Datei
//   <link rel="icon" href="/icon" sizes="512x512">        <- app/icon.tsx
//
// — und der Reiter im Browser nimmt in der Regel die .ico. Wer den Pfad in
// SIGNET aendert, muss dieses Skript danach laufen lassen:
//
//   node scripts/generate-favicon.mjs
//
// Die Pfaddaten werden aus lib/marke.ts gelesen, nicht hier wiederholt: eine
// zweite Kopie waere genau die Quelle der Abweichung, die das Skript
// verhindern soll. Bricht das Auslesen, bricht der Lauf — lieber kein Bild
// als ein falsches.
//
// sharp kommt aus dem Abhaengigkeitsbaum von Next.js (Bildoptimierung) und
// ist bewusst NICHT als eigene Abhaengigkeit eingetragen: das Skript laeuft
// von Hand und selten. Faellt sharp aus dem Baum, sagt es das unten deutlich,
// statt still etwas Falsches zu schreiben.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUELLE = path.join(WURZEL, "lib/marke.ts");
const ZIEL = path.join(WURZEL, "app/favicon.ico");

// Dieselben Farben wie app/icon.tsx und apple-icon.tsx: Marke auf der
// Akzentflaeche. Die Kachel ist randlos und deckend — anders als bei den
// beiden PNG-Routen rundet hier niemand nach, ein Reiter zeigt das Quadrat.
const KACHEL = "#3d5afe";
const MARKE = "#fafafa";

// Groessen wie in der bisherigen Datei. 16 px ist der Reiter, 32 px die
// Lesezeichenleiste und Windows, 48 px die Verknuepfung auf dem Desktop.
//
// Der Anteil der Kantenlaenge ist pro Groesse anders, und das ist Absicht:
// bei 16 px verliert der Rundkurs mit dem 0.7 der App-Icons (app/icon.tsx)
// seine Oeffnung — es bleibt ein Fleck. 0.88 haelt sie offen. Bei 32 und
// 48 px ist dieser Druck weg, dort wirkt 0.8 ruhiger.
const RAHMEN = [
  { kante: 16, anteil: 0.88 },
  { kante: 32, anteil: 0.8 },
  { kante: 48, anteil: 0.8 },
];

// Gerastert wird acht Mal so gross und danach heruntergerechnet: librsvg
// direkt auf 16 px zeichnen zu lassen, laesst die Kanten der Ellipse
// ausfransen.
const UEBERABTASTUNG = 8;

async function ladeSharp() {
  try {
    return (await import("sharp")).default;
  } catch (fehler) {
    console.error(
      "sharp ist nicht aufloesbar. Es kam bisher aus dem Abhaengigkeitsbaum\n" +
        "von Next.js — offenbar nicht mehr. Entweder `npm install` nachziehen\n" +
        "oder sharp als devDependency eintragen und diesen Kopfkommentar\n" +
        "korrigieren.\n",
      fehler.message,
    );
    process.exit(1);
  }
}

/** Liest viewBox und Pfad des Signets aus lib/marke.ts. */
async function leseSignet() {
  const quelle = await readFile(QUELLE, "utf8");
  const anfang = quelle.indexOf("export const SIGNET");
  if (anfang === -1) throw new Error(`SIGNET nicht in ${QUELLE} gefunden.`);
  const block = quelle.slice(anfang);
  const viewBox = block.match(/viewBox:\s*"([^"]+)"/)?.[1];
  const pfad = block.match(/pfad:\s*\n?\s*"([^"]+)"/)?.[1];
  if (!viewBox || !pfad) throw new Error("viewBox oder pfad in SIGNET nicht lesbar.");
  const teile = viewBox.split(/\s+/).map(Number);
  if (teile.length !== 4 || teile.some(Number.isNaN)) throw new Error(`viewBox unbrauchbar: ${viewBox}`);
  return { viewBox, pfad, breite: teile[2], hoehe: teile[3] };
}

/** Ein Rahmen als SVG: Kachel, darauf das mittig platzierte Signet. */
function baueSvg(signet, kante, anteil) {
  const px = kante * UEBERABTASTUNG;
  const markeBreite = px * anteil;
  const markeHoehe = (markeBreite / signet.breite) * signet.hoehe;
  const x = (px - markeBreite) / 2;
  const y = (px - markeHoehe) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">` +
    `<rect width="${px}" height="${px}" fill="${KACHEL}"/>` +
    `<svg x="${x}" y="${y}" width="${markeBreite}" height="${markeHoehe}" viewBox="${signet.viewBox}">` +
    `<path fill="${MARKE}" d="${signet.pfad}"/>` +
    `</svg></svg>`
  );
}

/**
 * Packt PNG-Rahmen in eine .ico.
 *
 * Aufbau: 6 Byte Kopf, je 16 Byte Verzeichniseintrag, dahinter die Bilder.
 * PNG statt BMP im Inneren — das versteht jeder Browser und Windows seit
 * Vista, und es ist deutlich kleiner.
 */
function baueIco(rahmen) {
  const kopf = Buffer.alloc(6);
  kopf.writeUInt16LE(0, 0); // reserviert
  kopf.writeUInt16LE(1, 2); // Typ 1 = Icon
  kopf.writeUInt16LE(rahmen.length, 4);

  const verzeichnis = Buffer.alloc(16 * rahmen.length);
  let versatz = kopf.length + verzeichnis.length;
  rahmen.forEach(({ kante, daten }, i) => {
    const e = i * 16;
    // 256 px waeren als 0 zu schreiben; so gross wird hier keiner.
    verzeichnis.writeUInt8(kante, e);
    verzeichnis.writeUInt8(kante, e + 1);
    verzeichnis.writeUInt8(0, e + 2); // Farben in der Palette: keine
    verzeichnis.writeUInt8(0, e + 3); // reserviert
    verzeichnis.writeUInt16LE(1, e + 4); // Ebenen
    verzeichnis.writeUInt16LE(32, e + 6); // Bit pro Pixel
    verzeichnis.writeUInt32LE(daten.length, e + 8);
    verzeichnis.writeUInt32LE(versatz, e + 12);
    versatz += daten.length;
  });

  return Buffer.concat([kopf, verzeichnis, ...rahmen.map((r) => r.daten)]);
}

const sharp = await ladeSharp();
const signet = await leseSignet();
console.log(`Signet aus lib/marke.ts: viewBox "${signet.viewBox}", ${signet.pfad.length} Zeichen Pfad`);

const rahmen = [];
for (const { kante, anteil } of RAHMEN) {
  const daten = await sharp(Buffer.from(baueSvg(signet, kante, anteil)))
    .resize(kante, kante, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  rahmen.push({ kante, daten });
  console.log(`  ${kante}x${kante}  Marke ${Math.round(anteil * 100)} % der Kante  ${daten.length} B`);
}

const ico = baueIco(rahmen);
await writeFile(ZIEL, ico);
console.log(`${path.relative(WURZEL, ZIEL)} geschrieben, ${ico.length} B`);
