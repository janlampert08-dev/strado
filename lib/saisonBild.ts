// Das Saisonrückblick-Bild: "Meine Saison 2026" als JPEG, im Feed-Format
// (1080 × 1350) oder als Story (1080 × 1920). Nur im Browser aufrufbar —
// Canvas und document.fonts gibt es auf dem Server nicht.
//
// Dieselbe Sprache wie das Teilen-Bild einer Fahrt (lib/shareImage.ts):
// dunkler Verlauf, Haarlinien statt Kästen, Inter und Plex Mono von der
// Seite, Wortmarke und Signet als Kontur aus lib/marke.ts. Die Farben kommen
// von dort, damit beide Bilder nebeneinander wie eines aussehen.
//
// Wovon das Bild lebt, ist die Ortsliste. AGENTS.md → Product: der Ortsname
// ist die Einheit der Wiedererkennung, und was weitergeleitet wird, ist ein
// Pass. Deshalb stehen die Pässe gross und die Summen klein darunter, und
// neben jedem Pass seine Scheitelhöhe in Mono — so wie sie auf der Passhöhe
// auf dem Schild steht. Das ist die Topo-Anmutung, ohne eine Karte zu
// zeichnen, die bei zwanzig Strecken in der Schweiz ohnehin leer wirkte.
//
// Die Wortmarke steht auf jeder Variante. Ein Bild ohne Marke wäre die
// Funktion, die man sich selbst wegverkauft (docs/premium-naechste-features.md
// §3) — deshalb gibt es dafür keinen Schalter.
//
// Keine Zeiten, kein Tempo (lib/fahrtstatistik.ts, Kopf).

import { SIGNET, WORTMARKE } from "@/lib/marke";
import { ACCENT, BG_BOTTOM, BG_TOP, BORDER, INK, MUTED, loadFonts } from "@/lib/shareImage";
import { statsColumns } from "@/lib/shareLayout";
import {
  listeKuerzen,
  monatsBalken,
  saisonLayout,
  schriftFuerBreite,
  textKuerzen,
  zahlCH,
  type SaisonFormat,
} from "@/lib/saisonLayout";
import type { Saison } from "@/lib/saisonrueckblick";

const MONATSKUERZEL = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
// Die leere Monatsspur: eine Stufe über dem Hintergrund, im Ton der
// Haarlinien. Ein Monat ohne Fahrt ist Teil der Kurve, kein Loch.
const SPUR = "rgba(255, 255, 255, 0.07)";

function nomen(anzahl: number, eins: string, mehr: string): string {
  return anzahl === 1 ? eins : mehr;
}

export async function renderSaisonBild(saison: Saison, format: SaisonFormat): Promise<Blob> {
  const layout = saisonLayout(format, { mitMeistgefahren: saison.meistgefahren !== null });
  const { breite: W, hoehe: H, rand: PAD } = layout;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas wird nicht unterstützt.");

  const { sans, mono } = await loadFonts();
  const innen = W - PAD * 2;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Wortmarke oben links, im Akzent wie auf dem Fahrten-Bild.
  ctx.save();
  ctx.translate(PAD, layout.markeOben);
  const markeSkala = layout.markeHoehe / WORTMARKE.hoehe;
  ctx.scale(markeSkala, markeSkala);
  ctx.fillStyle = ACCENT;
  ctx.fill(new Path2D(WORTMARKE.pfad));
  ctx.restore();

  // Titelzeile: "Meine Saison" und das Jahr auf einer Grundlinie. Das Jahr
  // in Mono und gross — es ist eine Zahl, und die Ziffern der Plex Mono
  // stehen fest wie auf einem Kilometerstein.
  ctx.fillStyle = MUTED;
  ctx.font = `500 44px ${sans}`;
  const titelWort = "Meine Saison ";
  const wortBreite = ctx.measureText(titelWort).width;
  ctx.fillText(titelWort, PAD, layout.titelBaseline);
  ctx.fillStyle = INK;
  ctx.font = `600 116px ${mono}`;
  ctx.fillText(String(saison.jahr), PAD + wortBreite, layout.titelBaseline);

  // Listenkopf: Anzahl und Art links, Haarlinie über die volle Breite.
  const kopf =
    saison.ortArt === "paesse"
      ? `${zahlCH(saison.paesse)} ${nomen(saison.paesse, "PASS", "PÄSSE")}`
      : `${zahlCH(saison.orte.length)} ${nomen(saison.orte.length, "STRECKE", "STRECKEN")}`;
  ctx.fillStyle = MUTED;
  ctx.font = `600 22px ${sans}`;
  zeichneGesperrt(ctx, kopf, PAD, layout.listenKopfBaseline, 2.5);
  ctx.fillStyle = BORDER;
  ctx.fillRect(PAD, layout.listeOben, innen, 1);

  // Die Ortsliste.
  const { sichtbar, weitere } = listeKuerzen(saison.orte, layout.maxZeilen);
  const HOEHEN_SPALTE = 190;
  sichtbar.forEach((ort, i) => {
    const zeileOben = layout.listeOben + i * layout.zeilenHoehe;
    const baseline = zeileOben + layout.zeilenHoehe / 2 + 15;
    const nameBreite = ort.hoehe_m !== null ? innen - HOEHEN_SPALTE - 24 : innen;

    const px = schriftFuerBreite(
      (groesse) => {
        ctx.font = `600 ${groesse}px ${sans}`;
        return ctx.measureText(ort.name).width;
      },
      nameBreite,
      44,
      32,
    );
    ctx.font = `600 ${px}px ${sans}`;
    const name = textKuerzen(ort.name, (t) => ctx.measureText(t).width, nameBreite);
    ctx.fillStyle = INK;
    ctx.fillText(name, PAD, baseline);

    if (ort.hoehe_m !== null) {
      ctx.font = `500 32px ${mono}`;
      ctx.fillStyle = MUTED;
      ctx.textAlign = "right";
      ctx.fillText(`${zahlCH(ort.hoehe_m)} m`, W - PAD, baseline);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = BORDER;
    ctx.fillRect(PAD, zeileOben + layout.zeilenHoehe, innen, 1);
  });

  if (weitere > 0) {
    const zeileOben = layout.listeOben + sichtbar.length * layout.zeilenHoehe;
    ctx.font = `500 32px ${sans}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(`+${zahlCH(weitere)} weitere`, PAD, zeileOben + layout.zeilenHoehe / 2 + 12);
  }

  // "Am häufigsten" — eine leise Zeile, der Name darin in voller Tinte.
  if (saison.meistgefahren && layout.meistBaseline !== null) {
    const { name, anzahl } = saison.meistgefahren;
    const vorsatz = "Am häufigsten  ";
    const nachsatz = `  ${zahlCH(anzahl)}×`;
    ctx.font = `400 28px ${sans}`;
    const vorsatzBreite = ctx.measureText(vorsatz).width;
    ctx.font = `500 28px ${mono}`;
    const nachsatzBreite = ctx.measureText(nachsatz).width;
    ctx.font = `600 28px ${sans}`;
    const kurzName = textKuerzen(
      name,
      (t) => ctx.measureText(t).width,
      innen - vorsatzBreite - nachsatzBreite,
    );
    const nameBreite = ctx.measureText(kurzName).width;

    ctx.fillStyle = MUTED;
    ctx.font = `400 28px ${sans}`;
    ctx.fillText(vorsatz, PAD, layout.meistBaseline);
    ctx.fillStyle = INK;
    ctx.font = `600 28px ${sans}`;
    ctx.fillText(kurzName, PAD + vorsatzBreite, layout.meistBaseline);
    ctx.fillStyle = MUTED;
    ctx.font = `500 28px ${mono}`;
    ctx.fillText(nachsatz, PAD + vorsatzBreite + nameBreite, layout.meistBaseline);
  }

  // Fahrten je Monat: zwölf schmale Säulen auf einer Grundlinie, oben
  // 4 px gerundet, unten gerade. Leere Monate als flache Spur, damit die
  // Form der Saison — nichts im Winter, alles im Sommer — lesbar bleibt.
  const hoeheBalken = layout.monateBasis - layout.monateOben;
  const balken = monatsBalken(saison.proMonat, { x: PAD, breite: innen, hoehe: hoeheBalken });
  balken.forEach((b, i) => {
    if (b.hoehe > 0) {
      ctx.fillStyle = ACCENT;
      saeule(ctx, b.x, layout.monateBasis - b.hoehe, b.breite, b.hoehe, 4);
    } else {
      ctx.fillStyle = SPUR;
      ctx.fillRect(b.x, layout.monateBasis - 3, b.breite, 3);
    }
    ctx.fillStyle = MUTED;
    ctx.font = `500 20px ${sans}`;
    ctx.textAlign = "center";
    ctx.fillText(MONATSKUERZEL[i], b.x + b.breite / 2, layout.monateBasis + 30);
    ctx.textAlign = "left";
  });

  // Kennzahlen in Spalten mit Haarlinien — dieselbe Anordnung wie auf dem
  // Fahrten-Bild, nur ohne Zeit und Tempo.
  const fakten: [string, string][] = [
    [nomen(saison.paesse, "Pass", "Pässe"), zahlCH(saison.paesse)],
    ["Kilometer", zahlCH(saison.km)],
    ["Höhenmeter", zahlCH(saison.hoehenmeter)],
    [nomen(saison.fahrten, "Fahrt", "Fahrten"), zahlCH(saison.fahrten)],
  ];
  const LABEL_BASELINE = layout.kennzahlenOben + 20;
  const WERT_BASELINE = LABEL_BASELINE + 54;
  const SPALTEN_EINZUG = 28;
  const spalten = statsColumns(W, PAD, fakten.length);
  fakten.forEach(([label, wert], i) => {
    const spalte = spalten[i];
    const x = spalte.x + (i === 0 ? 0 : SPALTEN_EINZUG);
    const maxBreite = spalte.w - (i === 0 ? 0 : SPALTEN_EINZUG) - 12;
    if (i > 0) {
      ctx.fillStyle = BORDER;
      ctx.fillRect(Math.round(spalte.x), layout.kennzahlenOben - 4, 1, 88);
    }
    ctx.fillStyle = MUTED;
    ctx.font = `600 20px ${sans}`;
    ctx.fillText(textKuerzen(label.toUpperCase(), (t) => ctx.measureText(t).width, maxBreite), x, LABEL_BASELINE);

    ctx.fillStyle = INK;
    const px = schriftFuerBreite(
      (groesse) => {
        ctx.font = `600 ${groesse}px ${mono}`;
        return ctx.measureText(wert).width;
      },
      maxBreite,
      46,
      24,
    );
    ctx.font = `600 ${px}px ${mono}`;
    ctx.fillText(wert, x, WERT_BASELINE);
  });

  // Fusszeile wie auf dem Fahrten-Bild: Haarlinie, Signet, Adresse.
  ctx.fillStyle = BORDER;
  ctx.fillRect(PAD, layout.fussLinie, innen, 1);
  const SIGNET_HOEHE = 24;
  const SIGNET_BREITE = SIGNET_HOEHE * SIGNET.seitenverhaeltnis;
  ctx.save();
  ctx.translate(PAD, layout.fussBaseline - SIGNET_HOEHE);
  ctx.scale(SIGNET_HOEHE / SIGNET.hoehe, SIGNET_HOEHE / SIGNET.hoehe);
  ctx.fillStyle = ACCENT;
  ctx.fill(new Path2D(SIGNET.pfad));
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.font = `500 28px ${sans}`;
  ctx.fillText("app.strado.ch", PAD + SIGNET_BREITE + 14, layout.fussBaseline);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Bild konnte nicht erstellt werden."))),
      "image/jpeg",
      0.92,
    );
  });
}

// Versalien brauchen Luft zwischen den Buchstaben. ctx.letterSpacing gibt es
// nicht in jedem Browser (Safari erst spät), deshalb Zeichen für Zeichen.
function zeichneGesperrt(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  abstand: number,
) {
  let lauf = x;
  for (const zeichen of text) {
    ctx.fillText(zeichen, lauf, y);
    lauf += ctx.measureText(zeichen).width + abstand;
  }
}

// Säule mit gerundeter Oberkante und gerader Grundlinie.
function saeule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}
