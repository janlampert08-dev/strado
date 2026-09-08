// Rendert die TikTok-Slideshows aus daten.mjs nach out/ — 1080 x 1920 px.
//
// Bildsprache wie ueberall sonst (lib/shareImage.ts, ../instagram): dunkler
// Verlauf, Inter und IBM Plex Mono, Wortmarke als Kontur aus lib/marke.ts.
// Die Maschinerie steht in ../gemeinsam.mjs, hier nur das Layout.
//
// Der Unterschied zu Instagram ist nicht die Hoehe, sondern wo nichts stehen
// darf. TikTok legt eigene Bedienelemente ueber das Bild:
//
//   unten  ~470 px  Caption, Benutzername, Musikzeile, Punkte der Slideshow
//   rechts ~170 px  Like, Kommentar, Teilen, Drehscheibe
//   oben   ~150 px  "Folge ich / Fuer dich" und die Suche
//
// Deshalb sitzt der ganze Inhalt in einer Spalte von 830 px Breite zwischen
// y=150 und y=1450 — SICHER unten/rechts. Unterhalb davon liegt nur noch das
// blasse Hoehenprofil als Dekor: Wird es verdeckt, geht nichts verloren.
// Wer die Werte anfasst, prueft danach an einem echten Post nach, nicht im
// Bildbetrachter — dort sieht der leere Streifen unten falsch aus und ist
// trotzdem richtig.
//
// Aufruf:  node render.mjs

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SLIDESHOWS, STRECKEN } from "./daten.mjs";
import {
  FARBEN, esc, zeilen, fuss, kopf, marke, profilPfade, rendern, schriften,
} from "../gemeinsam.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const OUT = join(HIER, "out");

const BREITE = 1080;
const HOEHE = 1920;

// Die Sicherheitszonen von oben, an einer Stelle.
const SICHER_OBEN = 150;
const SICHER_UNTEN = 470;
const SPALTE = 830;

// Wie viele Zeilen der Text laut Vorlage haben soll: die festen Umbrueche
// plus eins. Steht als data-Attribut in der Karte, PASSE_AN unten misst
// nach und verkleinert, bis es stimmt.
const sollZeilen = (t) => String(t).split("\n").length;

// Laeuft im Browser, nachdem die Schriften da sind. Eine Ueberschrift, die
// laenger umbricht als vorgesehen, wird schrittweise kleiner gesetzt — sonst
// zerfaellt ein Hook wie "Du faehrst sie alle." still in zwei Zeilen und
// niemand sieht es, bis der Post draussen ist. Kein Ersatz fuer kurze Zeilen,
// nur das Netz darunter.
const PASSE_AN = `(() => {
  for (const el of document.querySelectorAll("[data-zeilen]")) {
    const soll = Number(el.dataset.zeilen);
    const hoehe = () => parseFloat(getComputedStyle(el).lineHeight);
    let px = parseFloat(getComputedStyle(el).fontSize);
    let zeilen = () => Math.round(el.scrollHeight / hoehe());
    while (zeilen() > soll && px > 44) {
      px -= 2;
      el.style.fontSize = px + "px";
    }
  }
})()`;

// --- Slides ------------------------------------------------------------------
function slideStrecke(slide, m) {
  const s = STRECKEN[slide.strecke];
  if (!s) throw new Error(`Unbekannte Strecke: ${slide.strecke}`);
  const W = SPALTE;
  const H = 300;
  const p = profilPfade(s.profil, W, H);
  // 2 x 2 statt 4 x 1 wie im Instagram-Format: in einer 830 px breiten Spalte
  // wird eine vierspaltige Zahlenreihe auf dem Telefon zu klein zum Lesen.
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
      <h1 class="titel-strecke" data-zeilen="1">${esc(s.name)}</h1>
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
        ${werte.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
      </dl>
    </main>
    ${fuss(m)}`;
}

// Die erste Slide. Sie entscheidet alles: wer hier nicht haengen bleibt, sieht
// die Strecken nie. Also nur Marker, Zeile, Unterzeile — sonst nichts.
function slideHook(slide, m) {
  return `
    ${kopf(m)}
    <main class="mitte mitte-hook">
      ${slide.marker ? `<p class="eyebrow">${esc(slide.marker)}</p>` : ""}
      <h1 class="titel-hook" data-zeilen="${sollZeilen(slide.titel)}">${zeilen(slide.titel)}</h1>
      <span class="strich"></span>
      ${slide.subline ? `<p class="subline">${zeilen(slide.subline)}</p>` : ""}
    </main>
    ${fuss(m)}`;
}

function slideStatement(slide, m) {
  return `
    ${kopf(m)}
    <main class="mitte mitte-statement">
      ${slide.marker ? `<p class="eyebrow">${esc(slide.marker)}</p>` : ""}
      <h1 class="titel-statement" data-zeilen="${sollZeilen(slide.titel)}">${zeilen(slide.titel)}</h1>
      ${slide.text ? `<p class="fliess">${zeilen(slide.text)}</p>` : ""}
      ${slide.fussnote ? `<p class="fussnote">${zeilen(slide.fussnote)}</p>` : ""}
    </main>
    ${fuss(m)}`;
}

const slideCta = slideStatement;

function slideListe(slide, m) {
  const s = STRECKEN[slide.strecke];
  if (!s) throw new Error(`Unbekannte Strecke: ${slide.strecke}`);
  return `
    ${kopf(m, slide.klasse)}
    <main class="mitte">
      <p class="eyebrow">Bestenliste · ${esc(s.region)}</p>
      <h1 class="titel-strecke" data-zeilen="1">${esc(s.name)}</h1>
      <p class="orte">${esc(s.laenge)} · Klasse ${esc(slide.klasse)}</p>
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

const BAUER = {
  hook: slideHook, strecke: slideStrecke, statement: slideStatement,
  liste: slideListe, cta: slideCta,
};

function seite(slide, m, fontCss) {
  const bauer = BAUER[slide.typ];
  if (!bauer) throw new Error(`Unbekannter Slide-Typ: ${slide.typ}`);
  // Das Dekor unterhalb der sicheren Zone — dieselbe Linie auf jeder Slide,
  // damit die Slideshow beim Wischen ruhig bleibt.
  const deko = profilPfade(STRECKEN.nordwest.profil, 1080, 260);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
${fontCss}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: ${BREITE}px; height: ${HOEHE}px; overflow: hidden;
  font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.karte { position: relative; width: ${BREITE}px; height: ${HOEHE}px;
  padding: ${SICHER_OBEN}px ${BREITE - SPALTE - 80}px ${SICHER_UNTEN}px 80px;
  display: flex; flex-direction: column; color: ${FARBEN.ink};
  background: linear-gradient(180deg, ${FARBEN.bgOben} 0%, ${FARBEN.bgUnten} 100%); }
.kopf { display: flex; align-items: center; justify-content: space-between; height: 40px; flex: none; }
.wortmarke { height: 40px; width: auto; }
.signet { height: 32px; width: auto; }
.pille { font-size: 26px; font-weight: 600; color: ${FARBEN.akzent}; padding: 10px 18px;
  border-radius: 999px; background: ${FARBEN.akzentWeich}; border: 1.5px solid rgba(107,131,255,0.35); }
.mitte { flex: 1; display: flex; flex-direction: column; padding-top: 90px; min-height: 0; }
.eyebrow { font-size: 26px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${FARBEN.muted}; }
.titel-strecke { font-size: 84px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.03;
  margin-top: 20px; }
.orte { font-size: 32px; color: ${FARBEN.muted}; margin-top: 18px; }
.profil { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
.profil svg { width: 100%; height: auto; }
.profil-fuss { display: flex; justify-content: space-between; margin-top: 16px;
  font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 24px; font-weight: 500;
  color: ${FARBEN.muted}; }
.werte { display: grid; grid-template-columns: 1fr 1fr; gap: 34px 40px; margin-top: 20px; }
.werte > div { border-top: 1px solid ${FARBEN.rand}; padding-top: 20px; }
.werte dt { font-size: 22px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: ${FARBEN.muted}; }
.werte dd { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 60px; font-weight: 600;
  margin-top: 10px; letter-spacing: -0.03em; }
.mitte-hook, .mitte-statement { justify-content: center; }
.titel-hook { font-size: 112px; font-weight: 700; line-height: 1.0; letter-spacing: -0.04em;
  margin-top: 28px; }
.strich { display: block; width: 132px; height: 8px; border-radius: 4px; margin-top: 48px;
  background: ${FARBEN.akzent}; }
.subline { font-size: 38px; line-height: 1.35; color: ${FARBEN.muted}; margin-top: 44px; }
.titel-statement { font-size: 92px; font-weight: 700; line-height: 1.04; letter-spacing: -0.035em;
  margin-top: 28px; }
.fliess { font-size: 38px; line-height: 1.4; color: ${FARBEN.muted}; margin-top: 40px; }
.fussnote { font-size: 32px; font-weight: 600; color: ${FARBEN.akzent}; margin-top: 52px; }
.bestenliste { list-style: none; margin-top: 48px; }
.bestenliste li { display: flex; align-items: center; gap: 26px; padding: 30px 0;
  border-bottom: 1px solid ${FARBEN.rand}; }
.bestenliste .rang { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 32px;
  font-weight: 600; color: ${FARBEN.muted}; width: 46px; }
.bestenliste .avatar { width: 66px; height: 66px; border-radius: 999px; flex: none;
  display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 600;
  background: rgba(255,255,255,0.07); color: ${FARBEN.muted}; }
.bestenliste .fahrer { font-size: 36px; font-weight: 500; flex: 1; }
.bestenliste .zeit { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 42px;
  font-weight: 600; letter-spacing: -0.02em; }
.bestenliste .podest .avatar { background: ${FARBEN.akzentWeich}; color: ${FARBEN.akzent}; }
.bestenliste .podest .rang { color: ${FARBEN.akzent}; }
.hinweis { margin-top: auto; padding-top: 36px; font-size: 24px; line-height: 1.4;
  color: ${FARBEN.muted}; }
.fuss { flex: none; display: flex; align-items: center; gap: 14px; margin-top: 40px; padding-top: 32px;
  border-top: 1px solid ${FARBEN.rand}; font-size: 30px; font-weight: 500; }
/* Unterhalb der sicheren Zone. Wird von der TikTok-Oberflaeche verdeckt und
   traegt deshalb keine Information. */
.deko { position: absolute; left: 0; bottom: 96px; width: 100%; }
</style></head><body><div class="karte">${bauer(slide, m)}
<svg class="deko" viewBox="0 0 1080 260" width="1080" height="260" aria-hidden="true">
  <path d="${deko.linie}" fill="none" stroke="${FARBEN.akzent}" stroke-width="4"
        stroke-linejoin="round" stroke-linecap="round" opacity="0.14"/>
</svg></div></body></html>`;
}

// --- Lauf --------------------------------------------------------------------
const m = await marke();
const fontCss = await schriften();

const seiten = SLIDESHOWS.flatMap((show) =>
  show.slides.map((slide, i) => ({
    datei: `${show.id}-${String(i + 1).padStart(2, "0")}.png`,
    html: seite(slide, m, fontCss),
  })),
);

const n = await rendern({ breite: BREITE, hoehe: HOEHE, out: OUT, seiten, nachLaden: PASSE_AN });
console.log(`\n${n} Slides in out/`);
