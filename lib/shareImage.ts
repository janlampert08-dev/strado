// Das Teilen-Bild einer Fahrt: 1080 × 1350 px, das 4:5-Format, das Instagram
// im Feed unbeschnitten zeigt und in der Story ohne Rand füllt — Titel,
// Streckenlinie, vier Kennzahlen und die Adresse der App.
//
// Dunkel wie das App-Theme (app/globals.css, :root[data-theme="dark"]), weil
// das Bild ein Stück Strado sein soll und nicht ein generischer Export eines
// Fitness-Trackers. Bewusst ohne Kästen und Rahmen: die Linie schwebt frei auf
// dem Verlauf, die Kennzahlen stehen in Spalten mit Haarlinien dazwischen —
// das Bild lebt von Leerraum, nicht von Flächen.
//
// Schriften kommen von der Seite, die das Bild zeichnet: Inter und IBM Plex
// Mono sind über next/font (app/layout.tsx) als CSS-Variablen auf <html>
// gesetzt, hier werden sie ausgelesen. Früher stand "system-ui" im Canvas,
// und das Bild sah auf jedem Gerät anders aus — Roboto auf Android, SF auf
// iOS, Segoe auf Windows. Die Wortmarke ist keine Schrift, sondern eine
// Kontur (lib/marke.ts).

import { formatDuration } from "@/lib/format";
import { SIGNET, WORTMARKE } from "@/lib/marke";
import { projectRoute, statsColumns } from "@/lib/shareLayout";

export interface ShareRideData {
  routeName: string;
  region: string;
  distanceKm: number;
  durationSeconds: number | null;
  date: string;
  elevationM: number | null;
  coordinates: [number, number][];
  // Höchster aktuell erreichter Meilenstein (siehe lib/achievements.ts),
  // optional als Chip in der Kopfzeile. null/undefined: kein Chip.
  milestoneLabel?: string | null;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 72;

const BG_TOP = "#111116";
const BG_BOTTOM = "#0b0b0d";
const INK = "#f2f2f4";
const MUTED = "#9096a3";
const ACCENT = "#6b83ff";
const ACCENT_SOFT = "rgba(107, 131, 255, 0.16)";
const BORDER = "rgba(255, 255, 255, 0.09)";

// Fallbacks, falls die Seite die Variablen nicht gesetzt hat (etwa ausserhalb
// des Root-Layouts) — dann wenigstens eine Schrift derselben Gattung.
const SANS_FALLBACK = "system-ui, sans-serif";
const MONO_FALLBACK = "ui-monospace, monospace";

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  {
    font,
    color,
    bg,
    border,
    padX = 18,
    padY = 10,
  }: { font: string; color: string; bg?: string; border?: string; padX?: number; padY?: number },
): number {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  // Die Schriftgrösse steckt hinter dem Gewicht ("600 26px …"); parseInt auf
  // den ganzen String hätte das Gewicht geliefert.
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 0);
  const h = size + padY * 2;
  if (bg) {
    roundedRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

// Verkleinert die Schrift, bis der Text in die Spalte passt — eine Fahrzeit
// wie "12:34:56" ist in Plex Mono breiter als die Spalte, und abschneiden
// wäre bei einer Kennzahl schlimmer als eine Nummer kleiner.
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, maxWidth: number) {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > 24 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
}

function strokePath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

// Liest die Schriftfamilien der Seite aus und wartet, bis die gebrauchten
// Schnitte geladen sind. Ein Canvas löst zwar das Laden aus, malt aber mit
// dem Fallback, wenn die Schrift beim fillText noch nicht da ist — und Plex
// Mono 600 ist auf der Fahrtseite nicht zwingend schon in Gebrauch.
async function loadFonts(): Promise<{ sans: string; mono: string }> {
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

  const { sans, mono } = await loadFonts();

  // Ruhiger vertikaler Verlauf statt Flat-Fill — zusammen mit dem Glow der
  // Streckenlinie gibt das dem Bild Tiefe, ohne laut zu wirken.
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Kopfzeile: Wortmarke links, Meilenstein-Chip rechts, beide auf einer
  // Mittellinie.
  const HEADER_Y = 64;
  const MARKE_HOEHE = 36;
  ctx.save();
  ctx.translate(PAD, HEADER_Y);
  ctx.scale(MARKE_HOEHE / WORTMARKE.hoehe, MARKE_HOEHE / WORTMARKE.hoehe);
  ctx.fillStyle = ACCENT;
  ctx.fill(new Path2D(WORTMARKE.pfad));
  ctx.restore();

  if (data.milestoneLabel) {
    const chipFont = `600 26px ${sans}`;
    ctx.font = chipFont;
    const chipW = ctx.measureText(data.milestoneLabel).width + 36;
    const chipH = 26 + 20;
    drawPill(ctx, data.milestoneLabel, WIDTH - PAD - chipW, HEADER_Y + MARKE_HOEHE / 2 - chipH / 2, {
      font: chipFont,
      color: ACCENT,
      bg: ACCENT_SOFT,
      border: "rgba(107, 131, 255, 0.35)",
    });
  }

  // Titel, ein oder zwei Zeilen. Alles darunter hängt sich an die tatsächlich
  // gebrauchte Zeilenzahl, sonst überlappt eine zweizeilige Bezeichnung die
  // Unterzeile. Oberkante der Versalien bei 196 px, die Grundlinie liegt bei
  // 60 px Inter rund 44 px tiefer.
  const TITLE_BASELINE = 240;
  const TITLE_LINE_HEIGHT = 68;
  ctx.fillStyle = INK;
  ctx.font = `700 60px ${sans}`;
  const titleLines = wrapText(ctx, data.routeName, PAD, TITLE_BASELINE, WIDTH - PAD * 2, TITLE_LINE_HEIGHT);
  const titleBottom = TITLE_BASELINE + (titleLines - 1) * TITLE_LINE_HEIGHT;

  const dateLabel = new Date(data.date).toLocaleDateString("de-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const subY = titleBottom + 16 + 30;
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${sans}`;
  ctx.fillText(`${data.region ? `${data.region} · ` : ""}${dateLabel}`, PAD, subY);

  // Streckenlinie, frei auf dem Verlauf, zwischen Unterzeile und Kennzahlen.
  const statsTop = HEIGHT - 330;
  const inset = 40;
  const areaTop = subY + 56;
  const areaBottom = statsTop - 48;

  if (data.coordinates.length > 1) {
    const points = projectRoute(data.coordinates, {
      x: PAD + inset,
      y: areaTop + inset,
      w: WIDTH - PAD * 2 - inset * 2,
      h: areaBottom - areaTop - inset * 2,
    });

    // Weicher Glow, dann derselbe Strich nochmal scharf darüber.
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 32;
    ctx.lineWidth = 12;
    strokePath(ctx, points);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 7;
    strokePath(ctx, points);

    const [start, finish] = [points[0], points[points.length - 1]];

    // Start: kleiner, zurückhaltender Punkt.
    ctx.beginPath();
    ctx.fillStyle = INK;
    ctx.arc(start[0], start[1], 9, 0, Math.PI * 2);
    ctx.fill();

    // Ziel: grösser, mit Ring — der Blick soll hier landen.
    ctx.beginPath();
    ctx.fillStyle = ACCENT;
    ctx.arc(finish[0], finish[1], 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = BG_BOTTOM;
    ctx.lineWidth = 5;
    ctx.arc(finish[0], finish[1], 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const avgKmh =
    data.durationSeconds && data.durationSeconds > 0
      ? data.distanceKm / (data.durationSeconds / 3600)
      : null;

  const facts: [string, string][] = [
    ["Distanz", `${data.distanceKm.toFixed(1)} km`],
    ["Zeit", data.durationSeconds !== null ? formatDuration(data.durationSeconds) : "—"],
    ["Ø Tempo", avgKmh !== null ? `${avgKmh.toFixed(0)} km/h` : "—"],
    ["Höhe", data.elevationM !== null ? `${data.elevationM} m` : "—"],
  ];

  // Vier gleich breite Spalten, getrennt durch Haarlinien. Die erste Spalte
  // fluchtet mit dem Titel, die weiteren rücken vom Trenner ab.
  const LABEL_BASELINE = statsTop + 20;
  const VALUE_BASELINE = LABEL_BASELINE + 54;
  const DIVIDER_H = 88;
  const COL_INSET = 28;
  const columns = statsColumns(WIDTH, PAD, facts.length);
  facts.forEach(([label, value], i) => {
    const col = columns[i];
    const x = col.x + (i === 0 ? 0 : COL_INSET);
    const maxW = col.w - (i === 0 ? 0 : COL_INSET) - 12;

    if (i > 0) {
      ctx.fillStyle = BORDER;
      ctx.fillRect(Math.round(col.x), statsTop - 4, 1, DIVIDER_H);
    }

    ctx.fillStyle = MUTED;
    ctx.font = `600 20px ${sans}`;
    ctx.fillText(label.toUpperCase(), x, LABEL_BASELINE);

    ctx.fillStyle = INK;
    fitFont(ctx, value, 600, 46, mono, maxW);
    ctx.fillText(value, x, VALUE_BASELINE);
  });

  // Fusszeile: Haarlinie, darunter Signet und die Adresse der App — der Weg
  // vom Bild zurück zu Strado, mehr braucht es hier nicht.
  const FOOTER_BASELINE = HEIGHT - 92;
  ctx.fillStyle = BORDER;
  ctx.fillRect(PAD, HEIGHT - 168, WIDTH - PAD * 2, 1);

  const SIGNET_HOEHE = 30;
  ctx.save();
  ctx.translate(PAD, FOOTER_BASELINE - SIGNET_HOEHE);
  ctx.scale(SIGNET_HOEHE / SIGNET.kante, SIGNET_HOEHE / SIGNET.kante);
  ctx.translate(SIGNET.einzug, 0);
  ctx.fillStyle = ACCENT;
  ctx.fill(new Path2D(SIGNET.pfad));
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.font = `500 28px ${sans}`;
  ctx.fillText("app.strado.ch", PAD + 44, FOOTER_BASELINE);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Bild konnte nicht erstellt werden."))),
      "image/jpeg",
      0.92,
    );
  });
}

// Gibt die Anzahl tatsächlich gezeichneter Zeilen zurück (max. 2), damit der
// Aufrufer nachfolgende Elemente dynamisch darunter positionieren kann.
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  let linesDrawn = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      linesDrawn++;
      // Nach zwei gezeichneten Zeilen wird der Rest abgeschnitten statt eine
      // dritte Zeile zu beginnen.
      if (linesDrawn >= 2) return linesDrawn;
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, lineY);
  return linesDrawn + 1;
}
