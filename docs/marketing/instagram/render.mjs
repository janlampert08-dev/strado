// Rendert die Instagram-Grafiken aus daten.mjs nach out/ — 1080 x 1350 px,
// das 4:5-Format, das Instagram im Feed unbeschnitten zeigt.
//
// Dieselbe Bildsprache wie das Teilen-Bild der App (lib/shareImage.ts): der
// dunkle Verlauf, Inter und IBM Plex Mono, die Wortmarke als Kontur aus
// lib/marke.ts. Ein Post soll erkennbar aus derselben App kommen wie das
// Bild, das ein Fahrer nach seiner Fahrt teilt.
//
// Gezeichnet wird in Chromium statt in Canvas: die Karten sind Layout, kein
// Pixelgeschiebe, und HTML kann Umbruch und Ausrichtung von selbst. Den
// Browser-Teil macht ../gemeinsam.mjs, hier steht nur das Layout dieses
// Formats. Aufruf:  node render.mjs

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { POSTS, STRECKEN } from "./daten.mjs";
import {
  FARBEN, esc, zeilen, fuss, kopf, marke, profilPfade, rendern, schriften,
} from "../gemeinsam.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const OUT = join(HIER, "out");

const BREITE = 1080;
const HOEHE = 1350;

// --- Slides ------------------------------------------------------------------
function slideStrecke(slide, m) {
  const s = STRECKEN[slide.strecke];
  if (!s) throw new Error(`Unbekannte Strecke: ${slide.strecke}`);
  const W = 936;
  const H = 380;
  const p = profilPfade(s.profil, W, H);
  const werte = [
    ["Länge", s.laenge],
    ["Höhe", s.hoehe],
    ["Max. Steigung", s.steigung],
    ["Kehren", s.kehren],
  ];
  return `
    ${kopf(m, slide.pille)}
    <main class="mitte">
      <p class="eyebrow">${esc(s.region)}${s.rund ? " · Rundfahrt" : ""}</p>
      <h1 class="titel-strecke">${esc(s.name)}</h1>
      <p class="orte">${s.rund ? `Start/Ziel: ${esc(s.start)}` : `${esc(s.start)} → ${esc(s.ziel)}`}</p>
      <div class="profil">
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
          <defs>
            <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${FARBEN.akzent}" stop-opacity="0.28"/>
              <stop offset="1" stop-color="${FARBEN.akzent}" stop-opacity="0"/>
            </linearGradient>
            <filter id="glow" x="-20%" y="-40%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="10" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <path d="${p.flaeche}" fill="url(#fl)"/>
          <path d="${p.linie}" fill="none" stroke="${FARBEN.akzent}" stroke-width="6"
                stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>
          <circle cx="${p.gx}" cy="${p.gy}" r="9" fill="${FARBEN.ink}"/>
        </svg>
        <div class="profil-fuss">
          <span>${p.mMin} m</span><span>${p.gipfelM} m bei km ${p.gipfelKm}</span><span>${p.mMax} m</span>
        </div>
      </div>
      <dl class="werte">
        ${werte.map(([k, v], i) => `<div${i ? ' class="mit-trenner"' : ""}><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
      </dl>
    </main>
    ${fuss(m)}`;
}

function slideCover(slide, m) {
  const deko = profilPfade(STRECKEN.nordwest.profil, 1080, 300);
  return `
    ${kopf(m)}
    <main class="mitte mitte-cover">
      ${slide.eyebrow ? `<p class="eyebrow">${esc(slide.eyebrow)}</p>` : ""}
      <h1 class="titel-cover">${zeilen(slide.titel)}</h1>
      ${slide.subline ? `<p class="subline">${zeilen(slide.subline)}</p>` : ""}
    </main>
    <svg class="deko" viewBox="0 0 1080 300" width="1080" height="300" aria-hidden="true">
      <path d="${deko.linie}" fill="none" stroke="${FARBEN.akzent}" stroke-width="4"
            stroke-linejoin="round" stroke-linecap="round" opacity="0.16"/>
    </svg>
    ${fuss(m)}`;
}

function slideStatement(slide, m) {
  return `
    ${kopf(m)}
    <main class="mitte mitte-statement">
      ${slide.eyebrow ? `<p class="eyebrow">${esc(slide.eyebrow)}</p>` : ""}
      <h1 class="titel-statement">${zeilen(slide.titel)}</h1>
      ${slide.text ? `<p class="fliess">${zeilen(slide.text)}</p>` : ""}
      ${slide.fussnote ? `<p class="fussnote">${zeilen(slide.fussnote)}</p>` : ""}
    </main>
    ${fuss(m)}`;
}

function slideListe(slide, m) {
  const s = STRECKEN[slide.strecke];
  return `
    ${kopf(m, slide.klasse)}
    <main class="mitte">
      <p class="eyebrow">Bestenliste · ${esc(s.region)}</p>
      <h1 class="titel-strecke">${esc(s.name)}</h1>
      <p class="orte">${esc(s.laenge)} · ${esc(s.kehren)} Kehren · Klasse ${esc(slide.klasse)}</p>
      <ol class="bestenliste">
        ${slide.fahrer.map(([name, zeit], i) => `
          <li${i < 3 ? ' class="podest"' : ""}>
            <span class="rang">${i + 1}</span>
            <span class="avatar">${esc(name.charAt(0).toUpperCase())}</span>
            <span class="fahrer">${esc(name)}</span>
            <span class="zeit">${esc(zeit)}</span>
          </li>`).join("")}
      </ol>
      <p class="hinweis">Namen und Zeiten sind Beispiele. Fahr nur so schnell,
        wie es sicher und erlaubt ist.</p>
    </main>
    ${fuss(m)}`;
}

const BAUER = { strecke: slideStrecke, cover: slideCover, statement: slideStatement, liste: slideListe };

function seite(slide, m, fontCss) {
  const bauer = BAUER[slide.typ];
  if (!bauer) throw new Error(`Unbekannter Slide-Typ: ${slide.typ}`);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
${fontCss}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: ${BREITE}px; height: ${HOEHE}px; overflow: hidden;
  font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.karte { position: relative; width: ${BREITE}px; height: ${HOEHE}px; padding: 64px 72px 72px;
  display: flex; flex-direction: column; color: ${FARBEN.ink};
  background: linear-gradient(180deg, ${FARBEN.bgOben} 0%, ${FARBEN.bgUnten} 100%); }
.kopf { display: flex; align-items: center; justify-content: space-between; height: 36px; flex: none; }
.wortmarke { height: 36px; width: auto; }
.signet { height: 30px; width: auto; }
.pille { font-size: 26px; font-weight: 600; color: ${FARBEN.akzent}; padding: 10px 18px;
  border-radius: 999px; background: ${FARBEN.akzentWeich}; border: 1.5px solid rgba(107,131,255,0.35); }
.mitte { flex: 1; display: flex; flex-direction: column; padding-top: 78px; min-height: 0; }
.eyebrow { font-size: 24px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${FARBEN.muted}; }
.titel-strecke { font-size: 76px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.04;
  margin-top: 18px; }
.orte { font-size: 30px; color: ${FARBEN.muted}; margin-top: 16px; }
.profil { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
.profil svg { width: 100%; height: auto; }
.profil-fuss { display: flex; justify-content: space-between; margin-top: 14px;
  font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 22px; font-weight: 500;
  color: ${FARBEN.muted}; }
.werte { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 28px; }
.werte > div { padding-left: 28px; }
.werte > div:first-child { padding-left: 0; }
.werte .mit-trenner { border-left: 1px solid ${FARBEN.rand}; }
.werte dt { font-size: 20px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: ${FARBEN.muted}; }
.werte dd { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 44px; font-weight: 600;
  margin-top: 14px; letter-spacing: -0.02em; }
.mitte-cover, .mitte-statement { justify-content: center; padding-bottom: 40px; }
.titel-cover { font-size: 104px; font-weight: 700; line-height: 1.02; letter-spacing: -0.035em;
  margin-top: 26px; }
.subline { font-size: 34px; line-height: 1.4; color: ${FARBEN.muted}; margin-top: 34px; max-width: 800px; }
.titel-statement { font-size: 88px; font-weight: 700; line-height: 1.06; letter-spacing: -0.03em;
  margin-top: 26px; }
.fliess { font-size: 34px; line-height: 1.45; color: ${FARBEN.muted}; margin-top: 36px; max-width: 830px; }
.fussnote { font-size: 30px; font-weight: 600; color: ${FARBEN.akzent}; margin-top: 44px; }
.deko { position: absolute; left: 0; right: 0; bottom: 168px; width: 100%; }
.bestenliste { list-style: none; margin-top: 52px; }
.bestenliste li { display: flex; align-items: center; gap: 26px; padding: 26px 0;
  border-bottom: 1px solid ${FARBEN.rand}; }
.bestenliste .rang { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 30px;
  font-weight: 600; color: ${FARBEN.muted}; width: 44px; }
.bestenliste .avatar { width: 62px; height: 62px; border-radius: 999px; flex: none;
  display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 600;
  background: rgba(255,255,255,0.07); color: ${FARBEN.muted}; }
.bestenliste .fahrer { font-size: 34px; font-weight: 500; flex: 1; }
.bestenliste .zeit { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 38px;
  font-weight: 600; letter-spacing: -0.02em; }
.bestenliste .podest .avatar { background: ${FARBEN.akzentWeich}; color: ${FARBEN.akzent}; }
.bestenliste .podest .rang { color: ${FARBEN.akzent}; }
.hinweis { margin-top: auto; padding-top: 32px; font-size: 22px; line-height: 1.4; color: ${FARBEN.muted};
  max-width: 720px; }
.fuss { flex: none; display: flex; align-items: center; gap: 14px; margin-top: 44px; padding-top: 30px;
  border-top: 1px solid ${FARBEN.rand}; font-size: 28px; font-weight: 500; }
</style></head><body><div class="karte">${bauer(slide, m)}</div></body></html>`;
}

// --- Lauf --------------------------------------------------------------------
const m = await marke();
const fontCss = await schriften();

const seiten = POSTS.flatMap((post) =>
  post.slides.map((slide, i) => ({
    datei: post.slides.length > 1
      ? `${post.id}-${String(i + 1).padStart(2, "0")}.png`
      : `${post.id}.png`,
    html: seite(slide, m, fontCss),
  })),
);

const n = await rendern({ breite: BREITE, hoehe: HOEHE, out: OUT, seiten });
console.log(`\n${n} Grafiken in out/`);
