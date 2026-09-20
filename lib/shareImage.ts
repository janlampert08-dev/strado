// Das Teilen-Bild einer Fahrt: 1080 × 1350 px, das 4:5-Format, das Instagram
// im Feed unbeschnitten zeigt und in der Story ohne Rand füllt.
//
// DAS "PASSBLATT" (Neugestaltung 2026-09-17). Die erste Fassung war ein
// dunkler Verlauf mit leuchtender Akzentlinie, versal gesperrten Etiketten
// und Kennzahlen in Mono — genau die Mittel, von denen sich die App im selben
// Durchgang verabschiedet hat (Glow als Dekoration, Mono als Kostüm, Farbe
// als Schmuck). Und sie liess den Ortsnamen in 60 px stehen, obwohl
// AGENTS.md ihn zur Einheit der Wiedererkennung erklärt: wer das Bild im
// Feed sieht, soll zuerst lesen, WO gefahren wurde.
//
// Die neue Fassung ist ein Blatt nach Schweizer Kartenart, ruhig und dunkel:
//
//   - oben eine präzise Zeile (Region · Datum) und darunter der Ortsname so
//     gross, wie er in zwei Zeilen passt;
//   - die Linie in Vordergrundfarbe, ohne Leuchten, mit Start als Ring und
//     Ziel als Akzentpunkt — dem einzigen Blau auf dem Blatt ausser dem
//     Höhenprofil — auf einem abgedunkelten Kartenausschnitt (Mapbox
//     Static Images, dark-v11); lädt die Karte nicht, bleibt der
//     bisherige Hintergrund ohne Karte;
//   - ein Massstabsbalken und ein Nordpfeil: Präzision als echte Angabe
//     (lib/shareLayout.ts, massstab), nicht als Verzierung;
//   - das Höhenprofil als Silhouette, wenn es eins gibt — das Gelände ist
//     das, was eine Passfahrt von einer Autobahnfahrt unterscheidet;
//   - vier Kennzahlen in zwei Reihen, grosse Ziffern, leichte Einheiten,
//     Satzschreibung;
//   - unten die Wortmarke in Vordergrundfarbe und die Adresse.
//
// Keine Koordinaten auf dem Blatt: der Track einer freien Fahrt ist um die
// Privatzone gekappt (lib/publicTrack.ts), eine Zahl daneben verriete, was
// die Kappung verbirgt.
//
// Schriften kommen von der Seite (next/font, app/layout.tsx), die Wortmarke
// ist eine Kontur (lib/marke.ts). IBM Plex Mono wird hier nicht mehr
// gebraucht; Zahlen stehen in Inter.

import { formatDuration } from "@/lib/format";
import { WORTMARKE } from "@/lib/marke";
import { massstab, profilPunkte, projectRoute } from "@/lib/shareLayout";
import { bboxFuerRoute, kartenPunkte, ladeKartenbild, staticKartenUrl } from "@/lib/shareMap";

// Öffentlicher Mapbox-Token (NEXT_PUBLIC_, im Client-Bundle ohnehin
// enthalten): ohne ihn — oder wenn das Standbild nicht lädt — fällt das
// Bild auf den bisherigen Hintergrund ohne Karte zurück.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export interface ShareRideData {
  routeName: string;
  region: string;
  distanceKm: number;
  durationSeconds: number | null;
  date: string;
  elevationM: number | null;
  coordinates: [number, number][];
  // Höchster aktuell erreichter Meilenstein (siehe lib/achievements.ts),
  // optional als Zeile über dem Titel. null/undefined: keine.
  milestoneLabel?: string | null;
  /** Höhenprofil (km/m), wenn vorhanden — sonst entfällt die Silhouette. */
  hoehenprofil?: { km: number; m: number }[] | null;
  /** Beschriftung der Höhen-Kennzahl: "Höchster Punkt" (Strecke) oder "Aufstieg" (freie Fahrt). */
  hoehenBeschriftung?: string;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 80;

const BG = "#0b0b0d";
const INK = "#f2f2f4";
const MUTED = "#8f95a3";
const ACCENT = "#6b83ff";
const HAIRLINE = "rgba(242, 242, 244, 0.12)";
const PROFIL_FLAECHE = "rgba(107, 131, 255, 0.14)";

// Exportiert für den Saisonrückblick (lib/saisonBild.ts): beide Bilder sind
// Stücke derselben Marke und sollen nebeneinander gepostet dieselben Farben
// tragen — eine zweite Palette daneben liefe beim nächsten Farbwechsel
// auseinander. Das Passblatt ist flach, deshalb sind oben und unten gleich.
export { INK, MUTED, ACCENT };
export const BG_TOP = BG;
export const BG_BOTTOM = BG;
export const BORDER = HAIRLINE;

const SANS_FALLBACK = "system-ui, sans-serif";
const MONO_FALLBACK = "ui-monospace, monospace";

async function loadFont(): Promise<string> {
  const style = getComputedStyle(document.documentElement);
  const sans = style.getPropertyValue("--font-inter").trim() || SANS_FALLBACK;
  try {
    await Promise.all([
      document.fonts.load(`400 28px ${sans}`),
      document.fonts.load(`500 28px ${sans}`),
      document.fonts.load(`600 72px ${sans}`),
      document.fonts.load(`700 104px ${sans}`),
    ]);
    await document.fonts.ready;
  } catch {
    // Kein FontFaceSet oder Laden gescheitert: dann eben mit dem, was da ist.
  }
  return sans;
}

function setzeFont(ctx: CanvasRenderingContext2D, weight: number, px: number, family: string) {
  ctx.font = `${weight} ${px}px ${family}`;
  // Leicht engere Laufweite für die grossen Grade, wo der Browser es kann
  // (Chrome/Edge/Safari 17+). Ohne Unterstützung bleibt es beim Standard —
  // kein Fehler.
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = px >= 60 ? `${-px * 0.02}px` : "0px";
}

/**
 * Bricht den Titel in höchstens zwei Zeilen und verkleinert ihn, bis er
 * passt. Ein langer Passname ("Col du Mollendruz – Vallée de Joux") soll
 * kleiner werden, nicht abgeschnitten.
 */
function titelZeilen(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  maxWidth: number,
): { zeilen: string[]; px: number } {
  for (let px = 104; px >= 56; px -= 4) {
    setzeFont(ctx, 700, px, family);
    const woerter = text.split(" ");
    const zeilen: string[] = [];
    let zeile = "";
    let passt = true;
    for (const wort of woerter) {
      const test = zeile ? `${zeile} ${wort}` : wort;
      if (ctx.measureText(test).width <= maxWidth) {
        zeile = test;
        continue;
      }
      if (!zeile || ctx.measureText(wort).width > maxWidth) {
        passt = false;
        break;
      }
      zeilen.push(zeile);
      zeile = wort;
    }
    if (zeile) zeilen.push(zeile);
    if (passt && zeilen.length <= 2) return { zeilen, px };
  }
  // Auch bei 56 px zu lang: zwei Zeilen, die zweite gekürzt.
  setzeFont(ctx, 700, 56, family);
  const zeilen: string[] = [];
  let zeile = "";
  for (const wort of text.split(" ")) {
    const test = zeile ? `${zeile} ${wort}` : wort;
    if (ctx.measureText(test).width <= maxWidth || !zeile) zeile = test;
    else {
      zeilen.push(zeile);
      zeile = wort;
    }
  }
  if (zeile) zeilen.push(zeile);
  if (zeilen.length > 2) {
    let zweite = zeilen.slice(1).join(" ");
    while (zweite.length > 1 && ctx.measureText(`${zweite}…`).width > maxWidth) {
      zweite = zweite.slice(0, -1);
    }
    return { zeilen: [zeilen[0], `${zweite.trimEnd()}…`], px: 56 };
  }
  return { zeilen, px: 56 };
}

function strich(ctx: CanvasRenderingContext2D, punkte: [number, number][]) {
  ctx.beginPath();
  punkte.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

// Liest die Schriftfamilien der Seite aus und wartet, bis die gebrauchten
// Schnitte geladen sind. Ein Canvas löst zwar das Laden aus, malt aber mit
// dem Fallback, wenn die Schrift beim fillText noch nicht da ist — und Plex
// Mono 600 ist auf der Fahrtseite nicht zwingend schon in Gebrauch.
export async function loadFonts(): Promise<{ sans: string; mono: string }> {
  const style = getComputedStyle(document.documentElement);
  const sans = style.getPropertyValue("--font-inter").trim() || SANS_FALLBACK;
  const mono = style.getPropertyValue("--font-ibm-plex-mono").trim() || MONO_FALLBACK;
  try {
    await Promise.all([
      document.fonts.load(`400 30px ${sans}`),
      document.fonts.load(`500 28px ${sans}`),
      document.fonts.load(`700 60px ${sans}`),
      document.fonts.load(`600 46px ${mono}`),
    ]);
    await document.fonts.ready;
  } catch {
    // Kein FontFaceSet oder Laden gescheitert: dann eben mit dem, was da ist.
  }
  return { sans, mono };
}

export async function renderShareImage(data: ShareRideData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas wird nicht unterstützt.");

  const sans = await loadFont();
  const innenBreite = WIDTH - PAD * 2;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ── Kopf: präzise Zeile, dann der Ortsname ───────────────────────────
  const dateLabel = new Date(data.date).toLocaleDateString("de-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const metaY = 132;
  setzeFont(ctx, 500, 28, sans);
  ctx.fillStyle = MUTED;
  ctx.textBaseline = "alphabetic";
  ctx.fillText([data.region, dateLabel].filter(Boolean).join("  ·  "), PAD, metaY);

  // Meilenstein rechtsbündig in derselben Zeile, Akzent als einziger Farbton.
  if (data.milestoneLabel) {
    setzeFont(ctx, 600, 28, sans);
    const w = ctx.measureText(data.milestoneLabel).width;
    ctx.fillStyle = ACCENT;
    ctx.fillText(data.milestoneLabel, WIDTH - PAD - w, metaY);
    ctx.beginPath();
    ctx.arc(WIDTH - PAD - w - 20, metaY - 10, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const { zeilen, px: titelPx } = titelZeilen(ctx, data.routeName, sans, innenBreite);
  setzeFont(ctx, 700, titelPx, sans);
  ctx.fillStyle = INK;
  const titelZeilenhoehe = Math.round(titelPx * 1.02);
  let titelY = metaY + 28 + titelPx;
  for (const z of zeilen) {
    ctx.fillText(z, PAD, titelY);
    titelY += titelZeilenhoehe;
  }
  const kopfUnten = titelY - titelZeilenhoehe + Math.round(titelPx * 0.28);

  // ── Kennzahlen unten zuerst festlegen, damit die Karte den Rest bekommt ─
  // Aus dem ersten Probedruck: mit 120/300 stand die zweite Kennzahlenreihe
  // auf der Wortmarke und jede Zahl auf ihrer Haarlinie.
  const FUSS_H = 150;
  const KENNZAHLEN_H = 330;
  const kennzahlenOben = HEIGHT - FUSS_H - KENNZAHLEN_H;
  const hatProfil = (data.hoehenprofil?.length ?? 0) > 1;
  const PROFIL_H = hatProfil ? 132 : 0;
  const profilOben = kennzahlenOben - PROFIL_H - (hatProfil ? 28 : 0);

  // ── Linie auf Kartenhintergrund ─────────────────────────────────────
  // Das Standbild kommt von Mapbox Static Images (dark-v11, passend zum
  // Blatt), die Linie bleibt Vektor: so sitzt sie pixelgenau und in den
  // eigenen Farben darüber, statt als verwaschener Overlay-Strich im
  // Standbild. Bbox und Pixelabbildung teilen sich lib/shareMap.ts, damit
  // Karte und Linie nicht auseinanderlaufen. Schlägt das Laden fehl,
  // steht das bisherige Bild ohne Karte — kein Fehler, kein Taint.
  const kartenBox = {
    x: PAD + 24,
    y: kopfUnten + 64,
    w: innenBreite - 48,
    h: (hatProfil ? profilOben : kennzahlenOben) - 56 - (kopfUnten + 64),
  };

  if (data.coordinates.length > 1 && kartenBox.h > 120) {
    let punkte = projectRoute(data.coordinates, kartenBox);
    let mitKarte = false;
    if (MAPBOX_TOKEN) {
      try {
        const bbox = bboxFuerRoute(data.coordinates, kartenBox.w / kartenBox.h);
        const bild = await ladeKartenbild(
          staticKartenUrl(bbox, kartenBox.w, kartenBox.h, MAPBOX_TOKEN),
        );
        ctx.save();
        ctx.drawImage(bild, kartenBox.x, kartenBox.y, kartenBox.w, kartenBox.h);
        // Abdunklung: hält die helle Linie auf hellen Kacheln lesbar und
        // zieht das Bild in die Marke zurück.
        ctx.fillStyle = "rgba(11, 11, 13, 0.38)";
        ctx.fillRect(kartenBox.x, kartenBox.y, kartenBox.w, kartenBox.h);
        ctx.strokeStyle = HAIRLINE;
        ctx.lineWidth = 2;
        ctx.strokeRect(kartenBox.x, kartenBox.y, kartenBox.w, kartenBox.h);
        ctx.restore();
        punkte = kartenPunkte(data.coordinates, bbox, kartenBox);
        mitKarte = true;
      } catch {
        punkte = projectRoute(data.coordinates, kartenBox);
      }
    }
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // Auf der Karte zuerst ein breiter Hintergrundstrich, sonst versinkt
    // die 7-px-Linie in Ortsnamen und Strassen.
    if (mitKarte) {
      ctx.strokeStyle = BG;
      ctx.lineWidth = 13;
      strich(ctx, punkte);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    strich(ctx, punkte);

    const start = punkte[0];
    const ziel = punkte[punkte.length - 1];
    // Start: Ring in Vordergrundfarbe, innen Hintergrund.
    ctx.beginPath();
    ctx.fillStyle = BG;
    ctx.arc(start[0], start[1], 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Ziel: gefüllter Akzentpunkt mit Hintergrundring, damit er auf der
    // Linie sitzt statt in ihr zu verschwimmen.
    ctx.beginPath();
    ctx.fillStyle = ACCENT;
    ctx.arc(ziel[0], ziel[1], 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = BG;
    ctx.stroke();
    ctx.restore();

    // Massstab links unten in der Kartenfläche, Nordpfeil rechts oben.
    const m = massstab(data.coordinates, kartenBox, 200);
    if (m) {
      const y = kartenBox.y + kartenBox.h + 28;
      ctx.fillStyle = MUTED;
      ctx.fillRect(PAD, y, m.px, 3);
      ctx.fillRect(PAD, y - 8, 3, 11);
      ctx.fillRect(PAD + m.px - 3, y - 8, 3, 11);
      setzeFont(ctx, 500, 24, sans);
      const label = m.km < 1 ? `${Math.round(m.km * 1000)} m` : `${m.km} km`;
      ctx.fillText(label, PAD + m.px + 16, y + 8);
    }
    const nx = WIDTH - PAD - 12;
    const ny = kartenBox.y + 4;
    ctx.fillStyle = MUTED;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx - 10, ny + 26);
    ctx.lineTo(nx, ny + 20);
    ctx.lineTo(nx + 10, ny + 26);
    ctx.closePath();
    ctx.fill();
    setzeFont(ctx, 600, 22, sans);
    const nw = ctx.measureText("N").width;
    ctx.fillText("N", nx - nw / 2, ny + 54);

    // Vorgeschriebene Nennung für das Standbild (logo=false angefordert):
    // unten rechts in der Kartenfläche, leise, aber lesbar.
    if (mitKarte) {
      setzeFont(ctx, 500, 20, sans);
      const quelle = "© Mapbox · © OpenStreetMap";
      const qw = ctx.measureText(quelle).width;
      ctx.fillStyle = MUTED;
      ctx.fillText(quelle, kartenBox.x + kartenBox.w - qw - 12, kartenBox.y + kartenBox.h - 12);
    }
  }

  // ── Höhenprofil ──────────────────────────────────────────────────────
  if (hatProfil && data.hoehenprofil) {
    const box = { x: PAD, y: profilOben, w: innenBreite, h: PROFIL_H };
    const punkte = profilPunkte(data.hoehenprofil, box);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.h);
    punkte.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.closePath();
    ctx.fillStyle = PROFIL_FLAECHE;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = ACCENT;
    strich(ctx, punkte);
    ctx.restore();
  }

  // ── Kennzahlen: zwei Reihen à zwei, Haarlinie dazwischen ──────────────
  const avgKmh =
    data.durationSeconds && data.durationSeconds > 0
      ? data.distanceKm / (data.durationSeconds / 3600)
      : null;
  const fakten: { beschriftung: string; wert: string; einheit: string }[] = [
    { beschriftung: "Distanz", wert: data.distanceKm.toFixed(1), einheit: "km" },
    {
      beschriftung: data.hoehenBeschriftung ?? "Höhe",
      wert: data.elevationM !== null ? data.elevationM.toLocaleString("de-CH") : "—",
      einheit: data.elevationM !== null ? "m" : "",
    },
    {
      beschriftung: "Zeit",
      wert: data.durationSeconds !== null ? formatDuration(data.durationSeconds) : "—",
      einheit: "",
    },
    { beschriftung: "Ø Tempo", wert: avgKmh !== null ? avgKmh.toFixed(0) : "—", einheit: avgKmh !== null ? "km/h" : "" },
  ];

  ctx.fillStyle = HAIRLINE;
  ctx.fillRect(PAD, kennzahlenOben, innenBreite, 2);
  ctx.fillRect(PAD, kennzahlenOben + KENNZAHLEN_H / 2, innenBreite, 2);
  ctx.fillRect(PAD + innenBreite / 2, kennzahlenOben + 24, 2, KENNZAHLEN_H - 48);

  fakten.forEach((f, i) => {
    const spalte = i % 2;
    const reihe = Math.floor(i / 2);
    const x = PAD + spalte * (innenBreite / 2) + (spalte === 1 ? 40 : 0);
    const oben = kennzahlenOben + reihe * (KENNZAHLEN_H / 2);
    const REIHE_H = KENNZAHLEN_H / 2;
    const beschriftungY = oben + 52;
    setzeFont(ctx, 500, 26, sans);
    ctx.fillStyle = MUTED;
    ctx.fillText(f.beschriftung, x, beschriftungY);

    const maxW = innenBreite / 2 - 60;
    let wertPx = 72;
    setzeFont(ctx, 600, wertPx, sans);
    const einheitBreite = () => {
      if (!f.einheit) return 0;
      setzeFont(ctx, 500, Math.round(wertPx * 0.42), sans);
      const w = ctx.measureText(f.einheit).width + 12;
      setzeFont(ctx, 600, wertPx, sans);
      return w;
    };
    while (wertPx > 44 && ctx.measureText(f.wert).width + einheitBreite() > maxW) {
      wertPx -= 4;
      setzeFont(ctx, 600, wertPx, sans);
    }
    // Grundlinie der Zahl mit festem Abstand zur Unterkante der Reihe statt
    // von der Beschriftung aus gerechnet — so bleibt sie über der Haarlinie,
    // auch wenn fitFont die Zahl verkleinert.
    const wertY = oben + REIHE_H - 34;
    ctx.fillStyle = INK;
    ctx.fillText(f.wert, x, wertY);
    if (f.einheit) {
      const w = ctx.measureText(f.wert).width;
      setzeFont(ctx, 500, Math.round(wertPx * 0.42), sans);
      ctx.fillStyle = MUTED;
      ctx.fillText(f.einheit, x + w + 12, wertY);
    }
  });

  // ── Fuss: Wortmarke und Adresse ──────────────────────────────────────
  const fussY = HEIGHT - 70;
  const MARKE_HOEHE = 34;
  ctx.save();
  ctx.translate(PAD, fussY - MARKE_HOEHE);
  ctx.scale(MARKE_HOEHE / WORTMARKE.hoehe, MARKE_HOEHE / WORTMARKE.hoehe);
  ctx.fillStyle = INK;
  ctx.fill(new Path2D(WORTMARKE.pfad));
  ctx.restore();

  setzeFont(ctx, 500, 28, sans);
  ctx.fillStyle = MUTED;
  const adresse = "app.strado.ch";
  ctx.fillText(adresse, WIDTH - PAD - ctx.measureText(adresse).width, fussY - 4);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Bild konnte nicht erstellt werden."))),
      "image/jpeg",
      0.92,
    );
  });
}
