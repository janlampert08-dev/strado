// Rendert die Instagram-Grafiken aus daten.mjs nach out/ — 1080 x 1350 px,
// das 4:5-Format, das Instagram im Feed unbeschnitten zeigt.
//
// Dieselbe Bildsprache wie das Teilen-Bild der App (lib/shareImage.ts): der
// dunkle Verlauf, Inter und IBM Plex Mono, die Wortmarke als Kontur aus
// lib/marke.ts. Ein Post soll erkennbar aus derselben App kommen wie das
// Bild, das ein Fahrer nach seiner Fahrt teilt.
//
// Gezeichnet wird in Chromium (headless, --screenshot) statt in Canvas: die
// Karten sind Layout, kein Pixelgeschiebe, und HTML kann Umbruch und
// Ausrichtung von selbst. Aufruf:  node render.mjs
//
// Die beiden Schriften werden einmal von Google Fonts geholt und unter
// .fonts/ zwischengespeichert (nicht eingecheckt, siehe .gitignore dort).

import { mkdir, mkdtemp, readFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { POSTS, STRECKEN } from "./daten.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const OUT = join(HIER, "out");
const FONTS = join(HIER, ".fonts");
const CHROME = process.env.CHROME_BIN ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BREITE = 1080;
const HOEHE = 1350;

// Dieselben Werte wie lib/shareImage.ts.
const FARBEN = {
  bgOben: "#111116",
  bgUnten: "#0b0b0d",
  ink: "#f2f2f4",
  muted: "#9096a3",
  akzent: "#6b83ff",
  akzentWeich: "rgba(107, 131, 255, 0.16)",
  rand: "rgba(255, 255, 255, 0.09)",
};

// --- Wortmarke ---------------------------------------------------------------
// Aus lib/marke.ts gelesen statt hier kopiert: die Kontur ist die Marke, und
// eine zweite Abschrift davon wuerde beim naechsten Feinschliff auseinander-
// laufen. Bewusst per Textabgleich und nicht als Import — die Datei ist
// TypeScript, dieses Skript laeuft ohne Build-Schritt.
async function marke() {
  const quelle = await readFile(join(HIER, "../../../lib/marke.ts"), "utf8");
  const bloecke = quelle.split("export const ").slice(1);
  const lies = (name) => {
    const block = bloecke.find((b) => b.startsWith(name));
    if (!block) throw new Error(`${name} nicht in lib/marke.ts gefunden.`);
    const viewBox = /viewBox:\s*"([^"]+)"/.exec(block)?.[1];
    const pfad = /pfad:\s*\n?\s*"([^"]+)"/.exec(block)?.[1];
    if (!viewBox || !pfad) throw new Error(`${name}: viewBox oder Pfad nicht lesbar.`);
    return { viewBox, pfad };
  };
  return { wortmarke: lies("WORTMARKE"), signet: lies("SIGNET") };
}

// --- Schriften ---------------------------------------------------------------
// Nur die Latin-Schnitte, eingebettet als data:-URI. Chromium laedt aus einer
// file://-Seite keine entfernten Schriften zuverlaessig nach, und eine Karte,
// die mit dem Fallback rendert, sieht auf jedem Rechner anders aus.
async function schriften() {
  const cache = join(FONTS, "eingebettet.css");
  try {
    await access(cache);
    return readFile(cache, "utf8");
  } catch {
    // Noch nicht geholt.
  }
  await mkdir(FONTS, { recursive: true });
  const url =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700" +
    "&family=IBM+Plex+Mono:wght@500;600&display=swap";
  const css = await (await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36" },
  })).text();

  // Die Antwort ist nach Unicode-Bereichen gegliedert, jeder Block mit einem
  // Kommentar davor. Fuer deutsche Beschriftungen reichen latin und latin-ext.
  const teile = css.split("/* ").slice(1);
  const gewollt = teile.filter((t) => /^latin(-ext)? \*\//.test(t));
  let ergebnis = "";
  for (const teil of gewollt) {
    const block = "@font-face" + teil.split("@font-face")[1];
    const woff = /url\((https:[^)]+)\)/.exec(block)?.[1];
    if (!woff) continue;
    const bytes = Buffer.from(await (await fetch(woff)).arrayBuffer());
    ergebnis += block.replace(woff, `data:font/woff2;base64,${bytes.toString("base64")}`) + "\n";
  }
  await writeFile(cache, ergebnis);
  return ergebnis;
}

// --- Hoehenprofil ------------------------------------------------------------
// Dieselbe Abbildung von km/m auf die Flaeche wie components/ElevationProfile.tsx
// und die Info-Seite: x linear ueber die Distanz, y ueber die tatsaechliche
// Spanne zwischen tiefstem und hoechstem Punkt.
function profilPfade(profil, w, h, pt = 16, pb = 6) {
  const kmMax = profil[profil.length - 1][0] || 1;
  const hoehen = profil.map((p) => p[1]);
  const mMin = Math.min(...hoehen);
  const mMax = Math.max(...hoehen);
  const spanne = Math.max(mMax - mMin, 1);
  const x = (km) => (km / kmMax) * w;
  const y = (m) => pt + (1 - (m - mMin) / spanne) * (h - pt - pb);
  const linie = profil.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  const gipfel = profil.reduce((a, b) => (b[1] > a[1] ? b : a));
  return {
    linie,
    flaeche: `${linie} L ${w} ${h} L 0 ${h} Z`,
    gx: x(gipfel[0]).toFixed(1),
    gy: y(gipfel[1]).toFixed(1),
    gipfelM: gipfel[1],
    gipfelKm: Math.round(gipfel[0]),
    mMin,
    mMax,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const zeilen = (s) => esc(s).replace(/\n/g, "<br>");

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

function kopf(m, pille) {
  return `<header class="kopf">
    <svg class="wortmarke" viewBox="${m.wortmarke.viewBox}" aria-label="strado"><path d="${m.wortmarke.pfad}" fill="${FARBEN.akzent}"/></svg>
    ${pille ? `<span class="pille">${esc(pille)}</span>` : ""}
  </header>`;
}

function fuss(m) {
  return `<footer class="fuss">
    <svg class="signet" viewBox="${m.signet.viewBox}" aria-hidden="true"><path d="${m.signet.pfad}" fill="${FARBEN.akzent}"/></svg>
    <span>app.strado.ch</span>
  </footer>`;
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

// --- Chromium ueber CDP ---------------------------------------------------------
// Nicht ueber --screenshot: dessen Bild ist so gross wie das Fenster, der
// Viewport darin aber 87 px kleiner (Fensterrahmen), und unten bliebe ein
// weisser Streifen. Emulation.setDeviceMetricsOverride setzt den Viewport
// exakt auf 1080 x 1350, Page.captureScreenshot liefert genau das.
async function browserStarten() {
  const profil = await mkdtemp(join(tmpdir(), "strado-ig-"));
  const proc = spawn(CHROME, [
    "--headless", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--remote-debugging-port=0",
    `--user-data-dir=${profil}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";

  // Der Port steht auf stderr ("DevTools listening on ws://...").
  const ws = await new Promise((resolve, reject) => {
    let puffer = "";
    const zeit = setTimeout(() => reject(new Error("Chromium meldet keinen DevTools-Port.")), 20000);
    proc.stderr.on("data", (d) => {
      puffer += d;
      stderr += d;
      const treffer = /ws:\/\/[^\s]+/.exec(puffer);
      if (treffer) { clearTimeout(zeit); resolve(treffer[0]); }
    });
    proc.on("exit", (code) => {
      clearTimeout(zeit);
      reject(new Error(`Chromium beendet (${code}).\n${stderr.split("\n").slice(-6).join("\n")}`));
    });
  });
  return { proc, ws, profil };
}

// Duenner CDP-Client: eine Verbindung, fortlaufende ids, Antworten nach id.
function cdp(url) {
  const sock = new WebSocket(url);
  const offen = new Map();
  const ereignisse = new Map();
  let id = 0;
  sock.addEventListener("message", (e) => {
    const n = JSON.parse(e.data);
    if (n.id && offen.has(n.id)) {
      const { ok, fehler } = offen.get(n.id);
      offen.delete(n.id);
      if (n.error) fehler(new Error(n.error.message));
      else ok(n.result);
    } else if (n.method && ereignisse.has(n.method)) {
      ereignisse.get(n.method).forEach((f) => f(n.params));
      ereignisse.delete(n.method);
    }
  });
  const bereit = new Promise((ok, fehler) => {
    sock.addEventListener("open", ok, { once: true });
    sock.addEventListener("error", () => fehler(new Error("CDP-Verbindung fehlgeschlagen.")), { once: true });
  });
  return {
    bereit,
    ruf: (method, params = {}, sessionId) => new Promise((ok, fehler) => {
      const n = ++id;
      offen.set(n, { ok, fehler });
      sock.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
    }),
    einmal: (method) => new Promise((ok) => {
      if (!ereignisse.has(method)) ereignisse.set(method, []);
      ereignisse.get(method).push(ok);
    }),
    zu: () => sock.close(),
  };
}

// --- Lauf --------------------------------------------------------------------
const m = await marke();
const fontCss = await schriften();
await mkdir(OUT, { recursive: true });
const tmp = join(OUT, ".seite.html");

const { proc, ws, profil } = await browserStarten();
const c = cdp(ws);
await c.bereit;

// Der Browser-Endpunkt kennt weder Page noch Emulation — beide gehoeren einem
// Ziel. Also ein leeres Ziel oeffnen und die Sitzung flach anhaengen, damit
// alle weiteren Aufrufe ueber dieselbe Verbindung laufen.
const { targetId } = await c.ruf("Target.createTarget", { url: "about:blank" });
const { sessionId } = await c.ruf("Target.attachToTarget", { targetId, flatten: true });
const sitzung = (method, params) => c.ruf(method, params, sessionId);

await sitzung("Page.enable");
await sitzung("Emulation.setDeviceMetricsOverride", {
  width: BREITE, height: HOEHE, deviceScaleFactor: 1, mobile: false,
});

let n = 0;
try {
  for (const post of POSTS) {
    for (const [i, slide] of post.slides.entries()) {
      const datei = post.slides.length > 1
        ? `${post.id}-${String(i + 1).padStart(2, "0")}.png`
        : `${post.id}.png`;
      await writeFile(tmp, seite(slide, m, fontCss));

      const geladen = c.einmal("Page.loadEventFired");
      // cache-buster, sonst zeigt der zweite Aufruf derselben Datei die alte Seite
      await sitzung("Page.navigate", { url: `file://${tmp}?v=${Date.now()}-${n}` });
      await geladen;
      // Die Schriften stecken als data:-URI im CSS, sind also nicht im Netz —
      // trotzdem erst zeichnen, wenn der Font-Layer sie wirklich hat.
      await sitzung("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });

      const { data } = await sitzung("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(join(OUT, datei), Buffer.from(data, "base64"));
      n++;
      console.log(`  ${datei}`);
    }
  }
} finally {
  c.zu();
  // Erst wenn der Prozess wirklich weg ist, ist sein Profilordner ruhig —
  // sonst schreibt Chromium noch hinein, waehrend rm ihn abraeumt.
  const beendet = new Promise((ok) => proc.once("exit", ok));
  proc.kill();
  await beendet;
  await rm(tmp, { force: true });
  await rm(profil, { recursive: true, force: true }).catch(() => {});
}
console.log(`\n${n} Grafiken in out/`);
