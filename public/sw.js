// Service Worker: sorgt dafür, dass die App bei fehlendem oder zu schwachem
// Netz eine gebrandete Offline-Seite statt des nativen Browser-Fehlers zeigt,
// dass eine Fahrt auch ohne Empfang begonnen werden kann (/fahrten/neu liegt
// vorgeladen im Cache) und dass statische Build-Assets aus dem Cache statt
// erneut vom Netz kommen. Bewusst kein Versuch, die übrigen dynamischen
// Seiten (Streckendetails, Profile, API-Routen) offline verfügbar zu machen —
// die brauchen Live-Daten/Auth, ein Cache davon wäre potenziell falsch oder
// stale. Offline gespeicherte Strecken zeigt /offline aus IndexedDB
// (lib/offlineRoutes.ts), nicht aus diesem Cache.
//
// Getestet wird diese Datei als Ganzes in lib/serviceWorker.test.ts: der Test
// lädt sie in eine node:vm-Umgebung mit nachgebauter Cache-API. Deshalb stehen
// die Hilfsfunktionen unten als Top-Level-Funktionen — so erreicht der Test
// sie, ohne dass es für den Service Worker ein Bundling bräuchte.

// Die Build-Kennung kommt aus der Registrierungs-URL (/sw.js?v=<kennung>,
// siehe lib/serviceWorker.ts). Bis 2026-09 hiess der Cache fest
// "cornice-shell-v1": der Aufräum-Schritt unten verglich also immer mit
// demselben Namen und löschte nie etwas, und weil sich die Datei selbst nie
// änderte, installierte sich der Service Worker auch nie neu. Jeder Deploy
// liess seine /_next/static-Chunks für immer liegen (gemessen: 139 Einträge,
// 6,4 MB). Eine neue Kennung ist eine neue Skript-URL — der Browser
// installiert neu, und activate räumt den Vorgänger ab.
//
// Ohne Kennung (ein Tab, der noch den alten Registrierungscode ohne ?v= trägt)
// entsteht ein eigener Satz Caches; die nächste Seite mit Kennung ersetzt ihn.
const BUILD_KENNUNG = new URL(self.location.href).searchParams.get("v") || "ohne-kennung";

// Zwei Caches pro Build, damit das Trimmen die vorgeladene Shell nie trifft:
// SHELL_CACHE hält die Seiten, die offline funktionieren müssen, samt allem,
// was sie zum Laufen brauchen; LAUFZEIT_CACHE hält, was beim Surfen an
// statischen Assets anfällt, und wird auf MAX_LAUFZEIT_EINTRAEGE gekappt.
const SHELL_CACHE = `cornice-shell-${BUILD_KENNUNG}`;
const LAUFZEIT_CACHE = `cornice-shell-${BUILD_KENNUNG}-laufzeit`;

// Welche Caches diesem Service Worker gehören. Braucht es, weil der
// activate-Handler unten aufräumt: er löschte bis 2026-09 JEDEN Cache der
// Origin, der nicht CACHE_NAME hiess — und das ist nicht nur der eigene
// Vorgänger. mapbox-gl hält seine Kacheln in einem eigenen Cache namens
// "mapbox-tiles"; der fiel bei jeder Aktivierung mit weg und wurde danach neu
// aus dem Netz gefüllt. Mapbox rechnet pro Kachelabruf ab, und unterwegs zahlt
// die Nutzerin zusätzlich mit Mobildaten und Wartezeit.
//
// Der Name behält bewusst das alte Produktkürzel. Er ist zugleich der
// Aufräum-Schlüssel, und ein Umbenennen gehört zu der grösseren Frage, was
// mit den übrigen "cornice"-Speicherschlüsseln geschieht (Theme, Fahrt-
// Schnappschüsse, IndexedDB) — die hängen an Nutzerzustand, nicht an Text.
const EIGENE_CACHES = /^cornice-shell-/;

const OFFLINE_URL = "/offline";
const AUFZEICHNUNG_URL = "/fahrten/neu";

// Seiten, die bei der Installation samt ihren Assets vorgeladen und bei jedem
// Online-Besuch aufgefrischt werden. /fahrten/neu, damit eine Fahrt auch dort
// beginnen kann, wo schon die Talstation keinen Empfang mehr hat — bisher ging
// das nur, wenn die Seite zufällig noch offen war.
const SHELL_SEITEN = [OFFLINE_URL, AUFZEICHNUNG_URL];

// Wie lange eine Navigation auf die erste Antwort wartet, bevor die gesicherte
// Seite einspringt. Vorher gab es keine Grenze: bei einem Balken Empfang auf
// dem Pass hing die Seite, bis der Browser nach Minuten selbst aufgab. 3,5 s
// ist lang genug für eine normale Serverantwort über Mobilfunk (fetch löst
// schon mit den Kopfzeilen auf, nicht erst mit dem ganzen Dokument) und kurz
// genug, dass niemand vorher entnervt neu lädt.
const NAVIGATIONS_TIMEOUT_MS = 3500;

// Obergrenze für den Laufzeit-Cache. Ein einzelner Build hat weit weniger
// Chunks, die man beim normalen Surfen tatsächlich lädt; die Grenze fängt nur
// ab, was sich trotzdem anhäuft. Getrimmt wird nach Einfügereihenfolge (der
// älteste Eintrag geht zuerst) — ein echtes LRU müsste jeden Treffer neu
// schreiben, und das wären bei jedem Seitenaufruf Megabytes Schreiblast auf
// dem Telefon für einen Cache, der mit dem nächsten Deploy ohnehin verfällt.
const MAX_LAUFZEIT_EINTRAEGE = 100;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // /offline ist Pflicht: ohne sie gäbe es keinen Fallback, also scheitert
      // die Installation wie bisher (cache.addAll) und der alte Worker bleibt.
      await shellSeiteSichern(cache, OFFLINE_URL);
      // Die Aufzeichnung ist Zugabe: auf staging leitet sie Nicht-Moderatoren
      // auf die Anmeldung um, und ein Datenbankfehler auf dem Server darf die
      // Offline-Seite nicht mitreissen.
      await shellSeiteSichern(cache, AUFZEICHNUNG_URL).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => EIGENE_CACHES.test(key) && key !== SHELL_CACHE && key !== LAUFZEIT_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Abmelden ist ein POST-Formular, also eine Navigation, aber kein GET. Die
  // gesicherte Aufzeichnungsseite trägt den Anmeldezustand ihres Abrufs
  // (userId, Fahrzeuge); offline nach dem Abmelden noch als die alte Person
  // aufzuzeichnen, wäre falsch. Also vergessen — der nächste Online-Besuch
  // legt sie neu ab. Die Antwort selbst bleibt beim Netz.
  if (request.mode === "navigate" && url.pathname === "/auth/abmelden") {
    event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.delete(AUFZEICHNUNG_URL)));
    return;
  }

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(event, url));
    return;
  }

  // Fingerprinted Build-Assets ändern sich nie unter derselben URL —
  // cache-first ist hier sicher und spart wiederholte Netzwerk-Requests.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(statischesAsset(event));
  }
});

// Navigation (Seitenaufruf): Netz zuerst, damit Nutzer immer die aktuelle,
// authentifizierte Seite sehen. Die gesicherte Seite springt ein, wenn das
// Netz scheitert ODER nach NAVIGATIONS_TIMEOUT_MS noch nicht geantwortet hat.
async function navigation(event, url) {
  const netz = fetch(event.request);

  const shellPfad = SHELL_SEITEN.includes(url.pathname) ? url.pathname : null;
  if (shellPfad) {
    // Der Klon muss entstehen, bevor der Browser den Body liest. Dieses then
    // ist als erstes an netz gehängt und läuft daher vor dem Rennen unten.
    event.waitUntil(
      netz
        .then((antwort) =>
          istCachebar(antwort) ? shellAuffrischen(shellPfad, antwort.clone()) : undefined,
        )
        .catch(() => {}),
    );
  }

  const ausgang = await Promise.race([
    netz.then(
      (antwort) => ({ art: "netz", antwort }),
      () => ({ art: "fehler" }),
    ),
    warte(NAVIGATIONS_TIMEOUT_MS).then(() => ({ art: "zeit" })),
  ]);
  if (ausgang.art === "netz") return ausgang.antwort;

  const ersatz = await ersatzseite(url, ausgang.art);
  if (ersatz) return ersatz;

  // Nichts Passendes im Cache: bei einer Zeitüberschreitung weiter auf das
  // Netz warten — eine langsame Seite ist besser als keine.
  if (ausgang.art === "zeit") return netz.catch(() => Response.error());
  return Response.error();
}

// Welche gesicherte Seite eine gescheiterte oder zu langsame Navigation
// bekommt: die Shell-Seite selbst, wenn sie eine ist, sonst /offline.
//
// Ausnahme: eine Shell-Seite MIT Query (/fahrten/neu?fortsetzen=<token>, der
// Rückweg aus der Anmeldung nach einer Gastfahrt) wartet bei blosser
// Langsamkeit weiter auf das Netz. Die gesicherte Fassung kennt den Token
// nicht, und ohne ihn bliebe die Gastaufzeichnung liegen, statt ans Konto zu
// gehen. Scheitert das Netz ganz, ist die Seite ohne Token trotzdem besser als
// /offline — der Schnappschuss geht dabei nicht verloren.
async function ersatzseite(url, art) {
  const cache = await caches.open(SHELL_CACHE);
  if (SHELL_SEITEN.includes(url.pathname)) {
    if (url.search && art === "zeit") return null;
    const shell = await cache.match(url.pathname);
    if (shell) return shell;
  }
  return (await cache.match(OFFLINE_URL)) ?? null;
}

async function statischesAsset(event) {
  // caches.match durchsucht alle Caches der Origin — also auch die Shell
  // (vorgeladen) und, bis activate aufgeräumt hat, den Vorgänger.
  const gesichert = await caches.match(event.request);
  if (gesichert) return gesichert;

  const antwort = await fetch(event.request);
  // Nur gute Antworten ablegen. Bisher landete alles im Cache, auch eine
  // 404 für einen Chunk, den es nach einem Deploy nicht mehr gab — und die
  // wurde danach für immer aus dem Cache beantwortet.
  if (istCachebar(antwort)) {
    event.waitUntil(laufzeitAblegen(event.request, antwort.clone()));
  }
  return antwort;
}

async function laufzeitAblegen(request, antwort) {
  const cache = await caches.open(LAUFZEIT_CACHE);
  await cache.put(request, antwort);
  await cacheTrimmen(cache, MAX_LAUFZEIT_EINTRAEGE);
}

// cache.keys() liefert die Einträge in Einfügereihenfolge; weg müssen die
// vordersten.
async function cacheTrimmen(cache, maxEintraege) {
  const schluessel = await cache.keys();
  const ueberzaehlig = schluessel.length - maxEintraege;
  if (ueberzaehlig <= 0) return;
  await Promise.all(schluessel.slice(0, ueberzaehlig).map((s) => cache.delete(s)));
}

// Eine umgeleitete Antwort wird nie abgelegt: auf staging leitet der Proxy
// Nicht-Moderatoren auf /anmelden um, und als /fahrten/neu gespeichert
// zeigte die Anmeldung dann offline am falschen Ort. Ausserdem verweigern
// Browser eine umgeleitete Antwort als Antwort auf eine Navigation.
function istCachebar(antwort) {
  return Boolean(antwort) && antwort.ok && !antwort.redirected && antwort.type === "basic";
}

async function shellSeiteSichern(cache, pfad) {
  // cache: "reload" — die HTTP-Zwischenablage des Browsers soll hier keine
  // ältere Fassung der Seite unterschieben.
  const antwort = await fetch(pfad, { credentials: "same-origin", cache: "reload" });
  if (!istCachebar(antwort)) throw new Error(`${pfad} nicht cachebar (${antwort.status})`);
  await shellAblegen(cache, pfad, antwort);
}

async function shellAuffrischen(pfad, antwort) {
  const cache = await caches.open(SHELL_CACHE);
  await shellAblegen(cache, pfad, antwort);
}

// Legt die Seite ab und lädt nach, was sie zum Hydrieren braucht. Auch beim
// Auffrischen: liefert der Server schon einen neuen Build aus, bevor sich
// dieser Worker aktualisiert hat, verweist das frische HTML auf Chunks, die
// hier noch fehlen.
//
// Nur was das HTML selbst nennt, keine Verweise in den Chunks weiter. Dort
// steht vor allem die per next/dynamic nachgeladene Karte, gemessen 1,8 MB
// (mapbox-gl) — pro Deploy und Gerät, für eine Karte, die ohne Netz ohnehin
// keine Kacheln hat. FreeRideForm.tsx fängt eine fehlende Karte ab, die
// Aufzeichnung läuft ohne sie. Hat das Telefon die Karte schon einmal
// geladen, liegt sie meist noch im HTTP-Cache des Browsers.
async function shellAblegen(cache, pfad, antwort) {
  const html = await antwort.clone().text();
  await cache.put(pfad, antwort);
  const assets = assetUrlsAus(html, self.location.origin);
  await Promise.all(assets.map((assetUrl) => assetHolen(cache, assetUrl)));
}

// Ein fehlendes Asset lässt die Seite nicht scheitern: im schlimmsten Fall
// fehlt offline eine Schrift, nicht die Aufzeichnung.
async function assetHolen(cache, assetUrl) {
  try {
    if (await cache.match(assetUrl)) return;
    const antwort = await fetch(assetUrl, { credentials: "same-origin" });
    if (istCachebar(antwort)) await cache.put(assetUrl, antwort);
  } catch {
    // Kein Netz oder abgebrochen — dann eben ohne dieses Asset.
  }
}

// Findet die Build-Assets, auf die ein HTML-Dokument verweist, als absolute
// URLs der eigenen Origin: script- und link-Tags ("/_next/static/…") ebenso
// wie die eingebetteten RSC-Daten, die Chunks teils ohne Präfix nennen
// ("static/chunks/…"). Schriften nur, soweit das HTML sie vorlädt — das CSS
// verweist zusätzlich auf jede Unicode-Teilmenge (kyrillisch, griechisch …),
// die ein deutschsprachiges Telefon nie anfordert.
function assetUrlsAus(text, origin) {
  const gefunden = new Set();
  const muster = /(?:\/_next\/)?static\/(?:chunks|media|css)\/[A-Za-z0-9._~%\-/[\]]+?\.(?:js|css|woff2?)/g;
  for (const treffer of text.matchAll(muster)) {
    const pfad = treffer[0].startsWith("/_next/") ? treffer[0] : `/_next/${treffer[0]}`;
    gefunden.add(new URL(pfad, origin).href);
  }
  return [...gefunden];
}

function warte(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
