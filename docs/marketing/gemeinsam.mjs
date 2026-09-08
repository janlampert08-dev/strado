// Gemeinsame Render-Maschinerie der Marketing-Grafiken.
//
// Hier steht, was zwischen den Kanaelen gleich ist: die Wortmarke aus
// lib/marke.ts, die eingebetteten Schriften, die Farben aus
// lib/shareImage.ts, die Abbildung eines Hoehenprofils auf eine Flaeche und
// der Chromium-Aufruf. Was sich unterscheidet, bleibt beim Kanal: Format,
// Typografie und die Slides selbst — ein 9:16-Bild fuer TikTok ist nicht ein
// gestrecktes 4:5-Bild fuer Instagram, sondern ein eigenes Layout.
//
// Aufgeteilt wurde erst, als es den zweiten Kanal gab. Der Grund ist nicht
// Ordnung, sondern dass die Chromium-Anbindung unten die Stelle ist, an der
// beim ersten Mal die Arbeit steckte (siehe Kommentar bei rendern()) — die
// will man kein zweites Mal debuggen.

import { mkdir, mkdtemp, readFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HIER = dirname(fileURLToPath(import.meta.url));
const FONTS = join(HIER, ".fonts");

export const CHROME =
  process.env.CHROME_BIN ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// Dieselben Werte wie lib/shareImage.ts.
export const FARBEN = {
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
export async function marke() {
  const quelle = await readFile(join(HIER, "../../lib/marke.ts"), "utf8");
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
export async function schriften() {
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
export function profilPfade(profil, w, h, pt = 16, pb = 6) {
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

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const zeilen = (s) => esc(s).replace(/\n/g, "<br>");

// --- Kopf und Fuss -----------------------------------------------------------
// Die Wortmarke oben, das Signet mit der Adresse unten — auf jeder Karte,
// in jedem Format gleich aufgebaut.
export function kopf(m, pille) {
  return `<header class="kopf">
    <svg class="wortmarke" viewBox="${m.wortmarke.viewBox}" aria-label="strado"><path d="${m.wortmarke.pfad}" fill="${FARBEN.akzent}"/></svg>
    ${pille ? `<span class="pille">${esc(pille)}</span>` : ""}
  </header>`;
}

export function fuss(m) {
  return `<footer class="fuss">
    <svg class="signet" viewBox="${m.signet.viewBox}" aria-hidden="true"><path d="${m.signet.pfad}" fill="${FARBEN.akzent}"/></svg>
    <span>app.strado.ch</span>
  </footer>`;
}

// --- Chromium ueber CDP ---------------------------------------------------------
// Nicht ueber --screenshot: dessen Bild ist so gross wie das Fenster, der
// Viewport darin aber 87 px kleiner (Fensterrahmen), und unten bliebe ein
// weisser Streifen. Emulation.setDeviceMetricsOverride setzt den Viewport
// exakt auf das Zielformat, Page.captureScreenshot liefert genau das.
async function browserStarten() {
  const profil = await mkdtemp(join(tmpdir(), "strado-grafik-"));
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
// seiten ist eine Liste aus { datei, html }: der Kanal baut sein HTML selbst,
// hier wird nur noch fotografiert.
// nachLaden ist ein optionaler JS-Ausdruck, der nach dem Laden und nach
// document.fonts.ready in der Seite laeuft — die Stelle, an der ein Kanal
// nachmessen kann, was erst der Browser weiss (etwa ob eine Ueberschrift
// umgebrochen ist). Ohne den Parameter aendert sich nichts.
export async function rendern({ breite, hoehe, out, seiten, nachLaden }) {
  await mkdir(out, { recursive: true });
  const tmp = join(out, ".seite.html");

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
    width: breite, height: hoehe, deviceScaleFactor: 1, mobile: false,
  });

  let n = 0;
  try {
    for (const { datei, html } of seiten) {
      await writeFile(tmp, html);

      const geladen = c.einmal("Page.loadEventFired");
      // cache-buster, sonst zeigt der zweite Aufruf derselben Datei die alte Seite
      await sitzung("Page.navigate", { url: `file://${tmp}?v=${Date.now()}-${n}` });
      await geladen;
      // Die Schriften stecken als data:-URI im CSS, sind also nicht im Netz —
      // trotzdem erst zeichnen, wenn der Font-Layer sie wirklich hat.
      await sitzung("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
      if (nachLaden) await sitzung("Runtime.evaluate", { expression: nachLaden, awaitPromise: true });

      const { data } = await sitzung("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(join(out, datei), Buffer.from(data, "base64"));
      n++;
      console.log(`  ${datei}`);
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
  return n;
}
