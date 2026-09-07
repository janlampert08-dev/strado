import { formatDuration } from "@/lib/format";
import { WORTMARKE } from "@/lib/marke";

export interface ShareRideData {
  routeName: string;
  region: string;
  distanceKm: number;
  durationSeconds: number | null;
  date: string;
  elevationM: number | null;
  coordinates: [number, number][];
  // Höchster aktuell erreichter Meilenstein (siehe lib/achievements.ts),
  // optional als Chip über dem Titel gezeigt. null/undefined: kein Chip.
  milestoneLabel?: string | null;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 72;

// Dieselbe dunkle Palette wie das App-Theme (app/globals.css,
// :root[data-theme="dark"]) statt einer eigenen — das Bild soll wie ein Stück
// Strado aussehen, nicht wie ein generischer Fitness-Tracker-Export.
const BG_TOP = "#111116";
const BG_BOTTOM = "#0b0b0d";
const INK = "#f2f2f4";
const MUTED = "#9096a3";
const ACCENT = "#6b83ff";
const ACCENT_SOFT = "rgba(107, 131, 255, 0.16)";
const SURFACE = "rgba(255, 255, 255, 0.045)";
const BORDER = "rgba(255, 255, 255, 0.09)";

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

// Projiziert [lng,lat]-Koordinaten auf Canvas-Pixel: einfache äquirektangulare
// Näherung mit Breitengrad-Korrektur (cos(avgLat)) reicht für den kleinen
// geografischen Ausschnitt einer einzelnen Schweizer Passstrasse völlig aus.
function projectRoute(
  coordinates: [number, number][],
  box: { x: number; y: number; w: number; h: number },
): [number, number][] {
  const lats = coordinates.map((c) => c[1]);
  const avgLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);

  const xs = coordinates.map((c) => c[0] * cosLat);
  const ys = coordinates.map((c) => c[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;

  const scale = Math.min(box.w / spanX, box.h / spanY);
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return xs.map((x, i) => [
    centerX + (x - midX) * scale,
    centerY - (ys[i] - midY) * scale,
  ]);
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
  const h = parseInt(font, 10) + padY * 2;
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

export function renderShareImage(data: ShareRideData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas wird nicht unterstützt."));

  // Ruhiger vertikaler Verlauf statt Flat-Fill — zusammen mit dem Glow hinter
  // der Streckenkarte gibt das dem Bild etwas Tiefe, ohne laut zu wirken.
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Wortmarke: dieselbe Kontur wie Kopfleiste und Freigabebilder
  // (lib/marke.ts), hier über Path2D gezogen. Als Text ginge sie nicht — die
  // Marke ist in Familjen Grotesk gesetzt, die die App nirgends lädt, und
  // system-ui hätte je nach Gerät eine andere Form ergeben.
  const MARKE_HOEHE = 34;
  ctx.save();
  ctx.translate(PAD, 64);
  ctx.scale(MARKE_HOEHE / WORTMARKE.hoehe, MARKE_HOEHE / WORTMARKE.hoehe);
  ctx.fillStyle = ACCENT;
  ctx.fill(new Path2D(WORTMARKE.pfad));
  ctx.restore();

  // Meilenstein-Chip rechtsbündig in derselben Kopfzeile, falls vorhanden.
  if (data.milestoneLabel) {
    ctx.font = "600 26px system-ui, sans-serif";
    const chipW = ctx.measureText(data.milestoneLabel).width + 40;
    drawPill(ctx, data.milestoneLabel, WIDTH - PAD - chipW, 60, {
      font: "600 26px system-ui, sans-serif",
      color: ACCENT,
      bg: ACCENT_SOFT,
      border: "rgba(107, 131, 255, 0.35)",
    });
  }

  // Titel kann ein oder zwei Zeilen brauchen — alles darunter (Datum, Karte,
  // Stats) hängt sich an die tatsächlich gebrauchte Zeilenzahl statt an eine
  // feste Position, sonst würde eine zweizeilige Streckenbezeichnung das
  // Datum darunter überlappen.
  const TITLE_TOP_Y = 208;
  const TITLE_LINE_HEIGHT = 62;
  ctx.fillStyle = INK;
  ctx.font = "700 54px system-ui, sans-serif";
  const titleLines = wrapText(ctx, data.routeName, PAD, TITLE_TOP_Y, WIDTH - PAD * 2, TITLE_LINE_HEIGHT);
  const titleBottomY = TITLE_TOP_Y + (titleLines - 1) * TITLE_LINE_HEIGHT;

  const dateLabel = new Date(data.date).toLocaleDateString("de-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dateY = titleBottomY + TITLE_LINE_HEIGHT;
  ctx.fillStyle = MUTED;
  ctx.font = "400 30px system-ui, sans-serif";
  ctx.fillText(`${data.region ? `${data.region} · ` : ""}${dateLabel}`, PAD, dateY);

  // Streckenkarte als eigene Fläche mit dezentem Rahmen statt frei
  // schwebender Linie — verankert die Route optisch als "Karte im Bild".
  const mapBox = { x: PAD, y: dateY + 40, w: WIDTH - PAD * 2, h: 520 };
  roundedRect(ctx, mapBox.x, mapBox.y, mapBox.w, mapBox.h, 28);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (data.coordinates.length > 1) {
    ctx.save();
    roundedRect(ctx, mapBox.x, mapBox.y, mapBox.w, mapBox.h, 28);
    ctx.clip();

    // Weicher Glow hinter der Route statt einer flachen Linie — der
    // eigentliche Strich wird danach nochmal scharf darübergezeichnet.
    const inset = 64;
    const points = projectRoute(data.coordinates, {
      x: mapBox.x + inset,
      y: mapBox.y + inset,
      w: mapBox.w - inset * 2,
      h: mapBox.h - inset * 2,
    });

    ctx.strokeStyle = ACCENT;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 28;
    ctx.lineWidth = 10;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 6;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();

    const [start, finish] = [points[0], points[points.length - 1]];

    // Start: kleiner, zurückhaltender Punkt.
    ctx.beginPath();
    ctx.fillStyle = INK;
    ctx.arc(start[0], start[1], 8, 0, Math.PI * 2);
    ctx.fill();

    // Ziel: grösser, mit Ring — der Blick soll hier landen.
    ctx.beginPath();
    ctx.fillStyle = ACCENT;
    ctx.arc(finish[0], finish[1], 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = BG_BOTTOM;
    ctx.lineWidth = 5;
    ctx.arc(finish[0], finish[1], 14, 0, Math.PI * 2);
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

  // Vier eigenständige Karten statt Text in Spalten mit Trennlinie — dieselbe
  // Sprache wie die Bento-Stat-Kacheln in der App selbst (Card surface).
  const statsY = mapBox.y + mapBox.h + 32;
  const statsH = 148;
  const gap = 16;
  const cardW = (WIDTH - PAD * 2 - gap * (facts.length - 1)) / facts.length;
  facts.forEach(([label, value], i) => {
    const x = PAD + i * (cardW + gap);
    roundedRect(ctx, x, statsY, cardW, statsH, 20);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = MUTED;
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText(label.toUpperCase(), x + 22, statsY + 40);

    ctx.fillStyle = INK;
    ctx.font = "700 38px ui-monospace, monospace";
    ctx.fillText(value, x + 22, statsY + 98);
  });

  ctx.fillStyle = MUTED;
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Kuratierte Fahrstrecken für Auto & Motorrad", WIDTH / 2, HEIGHT - 56);
  ctx.textAlign = "left";

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
