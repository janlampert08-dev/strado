import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { buildKennung, serviceWorkerUrl } from "./serviceWorker";

// public/sw.js hat keinen Bundler und kann nichts importieren — getestet wird
// deshalb die echte Datei, geladen in eine node:vm-Umgebung, in der `self`,
// `caches` und `fetch` nachgebaut sind. Der Nachbau der Cache-API hält nur,
// was sw.js benutzt (open/keys/delete/match, put in Einfügereihenfolge).

const ORIGIN = "https://strado.test";
const SW_QUELLE = readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8");

class FakeCache {
  eintraege = new Map<string, Response>();
  async match(anfrage: Request | string) {
    const antwort = this.eintraege.get(schluessel(anfrage));
    return antwort ? antwort.clone() : undefined;
  }
  async put(anfrage: Request | string, antwort: Response) {
    const s = schluessel(anfrage);
    this.eintraege.delete(s);
    this.eintraege.set(s, antwort);
  }
  async delete(anfrage: Request | string) {
    return this.eintraege.delete(schluessel(anfrage));
  }
  async keys() {
    return [...this.eintraege.keys()].map((url) => new Request(url));
  }
  urls() {
    return [...this.eintraege.keys()].map((u) => u.replace(ORIGIN, ""));
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async match(anfrage: Request | string) {
    for (const cache of this.caches.values()) {
      const treffer = await cache.match(anfrage);
      if (treffer) return treffer;
    }
    return undefined;
  }
}

function schluessel(anfrage: Request | string): string {
  return new URL(typeof anfrage === "string" ? anfrage : anfrage.url, ORIGIN).href;
}

// Ein fetch()-Ergebnis im Browser hat für die eigene Origin type "basic";
// ein in Node gebautes Response-Objekt hat "default". sw.js legt nur "basic"
// ab, also setzt der Nachbau es wie der Browser.
function antwort(body: string, { status = 200, redirected = false } = {}): Response {
  const r = new Response(body, { status });
  Object.defineProperty(r, "type", { value: "basic" });
  Object.defineProperty(r, "redirected", { value: redirected });
  return r;
}

type Handler = (event: unknown) => void;
type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

function ladeServiceWorker(fetchImpl: FetchImpl, { kennung = "build-a" } = {}) {
  const handler = new Map<string, Handler>();
  const cacheStorage = new FakeCacheStorage();
  const abrufe: string[] = [];
  const selbst = {
    location: new URL(`${ORIGIN}/sw.js${kennung ? `?v=${kennung}` : ""}`),
    addEventListener: (typ: string, fn: Handler) => handler.set(typ, fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const kontext = vm.createContext({
    self: selbst,
    caches: cacheStorage,
    fetch: (eingabe: Request | string, init?: RequestInit) => {
      const url = schluessel(eingabe);
      abrufe.push(url.replace(ORIGIN, ""));
      return fetchImpl(url, init);
    },
    URL,
    Request,
    Response,
    Promise,
    Set,
    Error,
    Boolean,
    // Die Wartezeiten im Worker laufen im Test tausendfach schneller.
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms / 1000),
  });
  vm.runInContext(SW_QUELLE, kontext);

  async function ereignis(typ: string, felder: Record<string, unknown> = {}) {
    const verlaengert: Promise<unknown>[] = [];
    let antwortVersprechen: Promise<Response> | undefined;
    handler.get(typ)!({
      ...felder,
      waitUntil: (p: Promise<unknown>) => verlaengert.push(p),
      respondWith: (p: Promise<Response>) => {
        antwortVersprechen = p;
      },
    });
    const ergebnis = antwortVersprechen ? await antwortVersprechen : undefined;
    // waitUntil kann während der Antwort noch weitere Versprechen anhängen.
    for (let i = 0; i < verlaengert.length; i++) await verlaengert[i];
    return ergebnis;
  }

  function navigation(pfad: string, method = "GET") {
    const request = { url: `${ORIGIN}${pfad}`, method, mode: "navigate" };
    return ereignis("fetch", { request });
  }

  function asset(pfad: string) {
    const request = new Request(`${ORIGIN}${pfad}`);
    return ereignis("fetch", { request });
  }

  return {
    kontext: kontext as unknown as {
      assetUrlsAus: (text: string, basis: string) => string[];
    },
    caches: cacheStorage,
    abrufe,
    install: () => ereignis("install"),
    activate: () => ereignis("activate"),
    navigation,
    asset,
    anfrage: (request: Request) => ereignis("fetch", { request }),
  };
}

const OFFLINE_HTML = `<html><head><link rel="stylesheet" href="/_next/static/chunks/app.css"></head>
<body><script src="/_next/static/chunks/offline.js"></script></body></html>`;
const NEU_HTML = `<html><body><script src="/_next/static/chunks/aufzeichnung.js"></script>
<script>self.__next_f.push([1,"\\"static/chunks/rsc-verweis.js\\""])</script></body></html>`;

// Ein Server, wie ihn der Worker bei der Installation sieht: die Aufzeichnung
// lädt ihre Karte per next/dynamic nach (steht nur im Chunk), das CSS
// verweist relativ auf eine Schrift.
function server(ueberschreiben: Record<string, () => Promise<Response>> = {}): FetchImpl {
  const seiten: Record<string, () => Promise<Response>> = {
    "/offline": async () => antwort(OFFLINE_HTML),
    "/fahrten/neu": async () => antwort(NEU_HTML),
    "/_next/static/chunks/app.css": async () =>
      antwort("body{font-family:x}@font-face{src:url(../media/inter.woff2) format('woff2')}"),
    "/_next/static/chunks/offline.js": async () => antwort("console.log(1)"),
    "/_next/static/chunks/aufzeichnung.js": async () =>
      antwort('e.l("static/chunks/routemap.js")'),
    "/_next/static/chunks/routemap.js": async () => antwort("mapbox"),
    "/_next/static/chunks/rsc-verweis.js": async () => antwort("x"),
    "/_next/static/media/inter.woff2": async () => antwort("schrift"),
    ...ueberschreiben,
  };
  return async (url) => {
    const pfad = new URL(url).pathname + new URL(url).search;
    const seite = seiten[pfad] ?? seiten[new URL(url).pathname];
    if (!seite) return antwort("fehlt", { status: 404 });
    return seite();
  };
}

const netzWeg: FetchImpl = async () => {
  throw new TypeError("Failed to fetch");
};

describe("buildKennung / serviceWorkerUrl", () => {
  it("nimmt die Vercel-Deployment-ID vor dem Commit", () => {
    expect(buildKennung({ VERCEL_DEPLOYMENT_ID: "dpl_1", VERCEL_GIT_COMMIT_SHA: "abc" }, 0)).toBe(
      "dpl_1",
    );
    expect(buildKennung({ VERCEL_GIT_COMMIT_SHA: "abc" }, 0)).toBe("abc");
  });

  it("fällt lokal auf die Build-Zeit zurück, damit jeder Build neu installiert", () => {
    expect(buildKennung({}, 1000)).not.toBe(buildKennung({}, 2000));
    expect(buildKennung({}, 1000)).toMatch(/^lokal-/);
  });

  it("hängt die Kennung URL-kodiert an /sw.js", () => {
    expect(serviceWorkerUrl("dpl_1")).toBe("/sw.js?v=dpl_1");
    expect(serviceWorkerUrl("a b&c")).toBe("/sw.js?v=a%20b%26c");
    expect(serviceWorkerUrl(undefined)).toBe("/sw.js");
  });
});

describe("public/sw.js — Installation", () => {
  it("lädt /offline und die Aufzeichnung samt allen Chunks vor, die ihr HTML nennt", async () => {
    const sw = ladeServiceWorker(server());
    await sw.install();

    const shell = await sw.caches.open("cornice-shell-build-a");
    expect(shell.urls().sort()).toEqual(
      [
        "/offline",
        "/fahrten/neu",
        "/_next/static/chunks/app.css",
        "/_next/static/chunks/offline.js",
        "/_next/static/chunks/aufzeichnung.js",
        // Nur in den eingebetteten RSC-Daten genannt, ohne /_next/-Präfix:
        "/_next/static/chunks/rsc-verweis.js",
      ].sort(),
    );
    // Bewusst NICHT: die per next/dynamic nachgeladene Karte (1,8 MB
    // mapbox-gl, offline ohne Kacheln nutzlos) und die Schrift-Teilmengen,
    // auf die nur das CSS verweist.
    expect(shell.urls()).not.toContain("/_next/static/chunks/routemap.js");
    expect(shell.urls()).not.toContain("/_next/static/media/inter.woff2");
  });

  it("benennt die Caches nach der Build-Kennung aus der Registrierungs-URL", async () => {
    const sw = ladeServiceWorker(server(), { kennung: "dpl_xyz" });
    await sw.install();
    expect(await sw.caches.keys()).toEqual(["cornice-shell-dpl_xyz"]);
  });

  it("legt eine umgeleitete Aufzeichnung (staging-Sperre) nicht ab und installiert trotzdem", async () => {
    const sw = ladeServiceWorker(
      server({ "/fahrten/neu": async () => antwort("<html>Anmelden</html>", { redirected: true }) }),
    );
    await sw.install();
    const shell = await sw.caches.open("cornice-shell-build-a");
    expect(shell.urls()).toContain("/offline");
    expect(shell.urls()).not.toContain("/fahrten/neu");
  });

  it("scheitert, wenn /offline nicht zu haben ist — dann bleibt der alte Worker", async () => {
    const sw = ladeServiceWorker(server({ "/offline": async () => antwort("x", { status: 500 }) }));
    await expect(sw.install()).rejects.toThrow();
  });

  it("legt eine Seite erst ab, nachdem ihre Chunks im Cache liegen", async () => {
    const sw = ladeServiceWorker(server());
    await sw.install();

    // FakeCache behält die Einfügereihenfolge, und bei einem frischen Cache
    // ist sie die Reihenfolge der cache.put-Aufrufe. Lag die Seite vor ihren
    // Chunks, blieb nach einem abgebrochenen Worker HTML ohne Skripte zurück.
    const urls = (await sw.caches.open("cornice-shell-build-a")).urls();
    expect(urls.indexOf("/offline")).toBeGreaterThan(
      urls.indexOf("/_next/static/chunks/offline.js"),
    );
    expect(urls.indexOf("/offline")).toBeGreaterThan(urls.indexOf("/_next/static/chunks/app.css"));
    expect(urls.indexOf("/fahrten/neu")).toBeGreaterThan(
      urls.indexOf("/_next/static/chunks/aufzeichnung.js"),
    );
  });

  it("übersteht ein fehlendes Asset", async () => {
    const sw = ladeServiceWorker(
      server({ "/_next/static/chunks/aufzeichnung.js": async () => antwort("", { status: 404 }) }),
    );
    await sw.install();
    const shell = await sw.caches.open("cornice-shell-build-a");
    expect(shell.urls()).toContain("/fahrten/neu");
    expect(shell.urls()).not.toContain("/_next/static/chunks/aufzeichnung.js");
  });
});

describe("public/sw.js — Aktivierung", () => {
  it("löscht die eigenen Caches früherer Builds, aber nie den Kachel-Cache von Mapbox", async () => {
    const sw = ladeServiceWorker(server(), { kennung: "neu" });
    for (const name of [
      "cornice-shell-v1",
      "cornice-shell-alt",
      "cornice-shell-alt-laufzeit",
      "mapbox-tiles",
      "cornice-shell-neu",
      "cornice-shell-neu-laufzeit",
    ]) {
      await sw.caches.open(name);
    }
    await sw.activate();
    expect((await sw.caches.keys()).sort()).toEqual(
      ["cornice-shell-neu", "cornice-shell-neu-laufzeit", "mapbox-tiles"].sort(),
    );
  });
});

describe("public/sw.js — Navigation", () => {
  it("liefert bei Netz die Antwort des Servers", async () => {
    const sw = ladeServiceWorker(server({ "/strecken/1": async () => antwort("strecke") }));
    await sw.install();
    const r = await sw.navigation("/strecken/1");
    expect(await r!.text()).toBe("strecke");
  });

  it("fällt ohne Netz auf /offline zurück", async () => {
    let online = true;
    const basis = server();
    const sw = ladeServiceWorker((url, init) => (online ? basis(url, init) : netzWeg(url, init)));
    await sw.install();
    online = false;
    const r = await sw.navigation("/strecken/1");
    expect(await r!.text()).toBe(OFFLINE_HTML);
  });

  it("zeigt ohne Netz die gesicherte Aufzeichnungsseite statt /offline", async () => {
    let online = true;
    const basis = server();
    const sw = ladeServiceWorker((url, init) => (online ? basis(url, init) : netzWeg(url, init)));
    await sw.install();
    online = false;
    const r = await sw.navigation("/fahrten/neu");
    expect(await r!.text()).toBe(NEU_HTML);
  });

  it("wartet bei schwachem Netz nicht endlos, sondern springt nach dem Timeout ein", async () => {
    let haengen = false;
    const basis = server();
    const sw = ladeServiceWorker((url, init) =>
      haengen ? new Promise<Response>(() => {}) : basis(url, init),
    );
    await sw.install();
    haengen = true;
    const r = await sw.navigation("/strecken/1");
    expect(await r!.text()).toBe(OFFLINE_HTML);
  });

  // Staging-Kaltstart am 2026-09-23: eine Seite brauchte über 3,5 s, und
  // der Worker zeigte "Offline" bei voller Verbindung. Ausserhalb der
  // Aufzeichnung gibt es keine gesicherte Kopie — dort wird gewartet.
  it("zeigt bei einer langsamen gewöhnlichen Seite die Seite, nicht /offline", async () => {
    let langsam = false;
    const basis = server();
    const sw = ladeServiceWorker((url, init) =>
      langsam
        ? new Promise<Response>((resolve) => setTimeout(() => resolve(antwort("seite")), 8))
        : basis(url, init),
    );
    await sw.install();
    langsam = true;
    const r = await sw.navigation("/premium");
    expect(await r!.text()).toBe("seite");
  });

  // Next 16.3 liefert die Build-Dateien unter /_next/static/immutable/ aus.
  // Die Fixtures oben nutzen noch den alten Pfad; ohne diesen Fall blieb
  // unbemerkt, dass die Offline-Hülle kein einziges Skript enthielt.
  it("sichert auch Assets unter /_next/static/immutable/", async () => {
    const html = `<html><body><script src="/_next/static/immutable/chunks/abc123.js"></script>
<script>self.__next_f.push([1,"\\"static/immutable/chunks/rsc.js\\""])</script></body></html>`;
    const sw = ladeServiceWorker(
      server({
        "/fahrten/neu": async () => antwort(html),
        "/_next/static/immutable/chunks/abc123.js": async () => antwort("a"),
        "/_next/static/immutable/chunks/rsc.js": async () => antwort("b"),
      }),
    );
    await sw.install();
    const shell = await sw.caches.open("cornice-shell-build-a");
    expect(shell.urls()).toEqual(
      expect.arrayContaining([
        "/_next/static/immutable/chunks/abc123.js",
        "/_next/static/immutable/chunks/rsc.js",
      ]),
    );
  });

  it("wartet mit ?fortsetzen= bei blosser Langsamkeit weiter auf das Netz", async () => {
    let langsam = false;
    const basis = server();
    const sw = ladeServiceWorker((url, init) =>
      langsam
        ? new Promise<Response>((resolve) => setTimeout(() => resolve(antwort("frisch")), 30))
        : basis(url, init),
    );
    await sw.install();
    langsam = true;
    const r = await sw.navigation("/fahrten/neu?fortsetzen=abc");
    expect(await r!.text()).toBe("frisch");
  });

  it("frischt die gesicherte Aufzeichnung bei jedem Online-Besuch auf", async () => {
    let html = NEU_HTML;
    const sw = ladeServiceWorker(
      server({
        "/fahrten/neu": async () => antwort(html),
        "/_next/static/chunks/aufzeichnung2.js": async () => antwort("neu"),
      }),
    );
    await sw.install();
    html = NEU_HTML.replace("aufzeichnung.js", "aufzeichnung2.js");
    await sw.navigation("/fahrten/neu");
    const shell = await sw.caches.open("cornice-shell-build-a");
    expect(await (await shell.match("/fahrten/neu"))!.text()).toBe(html);
    // Das neue HTML verweist auf einen Chunk, den es vorher nicht gab.
    expect(shell.urls()).toContain("/_next/static/chunks/aufzeichnung2.js");
  });

  it("behält beim Auffrischen die alte Seite, wenn ein Chunk der neuen nicht ankommt", async () => {
    let html = NEU_HTML;
    const sw = ladeServiceWorker(
      server({
        "/fahrten/neu": async () => antwort(html),
        "/_next/static/chunks/aufzeichnung2.js": async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    );
    await sw.install();
    html = NEU_HTML.replace("aufzeichnung.js", "aufzeichnung2.js");
    await sw.navigation("/fahrten/neu");

    // Die Fahrerin öffnet die Aufzeichnung mit Empfang, der Server liefert
    // einen frischen Build, unterwegs bricht das Netz weg. Die alte Seite
    // passt zu den Chunks, die daneben liegen — die neue täte es nicht.
    const shell = await sw.caches.open("cornice-shell-build-a");
    expect(await (await shell.match("/fahrten/neu"))!.text()).toBe(NEU_HTML);
    expect(shell.urls()).toContain("/_next/static/chunks/aufzeichnung.js");
    expect(shell.urls()).not.toContain("/_next/static/chunks/aufzeichnung2.js");
  });

  it("legt eine unvollständige Seite ab, solange keine ältere im Cache liegt", async () => {
    let html = NEU_HTML;
    const sw = ladeServiceWorker(
      server({
        "/fahrten/neu": async () => antwort(html),
        "/_next/static/chunks/aufzeichnung2.js": async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    );
    await sw.install();
    // Das Abmelden vergisst die Aufzeichnungsseite — jetzt gibt es nichts
    // mehr zu verlieren, und eine Hülle mit fehlendem Chunk ist besser als
    // gar keine. Dieselbe Abwägung wie bei der Installation.
    await sw.navigation("/auth/abmelden", "POST");
    html = NEU_HTML.replace("aufzeichnung.js", "aufzeichnung2.js");
    await sw.navigation("/fahrten/neu");

    const shell = await sw.caches.open("cornice-shell-build-a");
    expect(await (await shell.match("/fahrten/neu"))!.text()).toBe(html);
  });

  it("vergisst die gesicherte Aufzeichnung beim Abmelden", async () => {
    const sw = ladeServiceWorker(server());
    await sw.install();
    await sw.navigation("/auth/abmelden", "POST");
    const shell = await sw.caches.open("cornice-shell-build-a");
    expect(shell.urls()).not.toContain("/fahrten/neu");
    expect(shell.urls()).toContain("/offline");
  });
});

describe("public/sw.js — statische Assets", () => {
  it("antwortet aus dem Cache und legt nur gute Antworten ab", async () => {
    const sw = ladeServiceWorker(server());
    await sw.asset("/_next/static/chunks/offline.js");
    await sw.asset("/_next/static/chunks/gibtsnicht.js");
    const laufzeit = await sw.caches.open("cornice-shell-build-a-laufzeit");
    expect(laufzeit.urls()).toEqual(["/_next/static/chunks/offline.js"]);

    const vorher = sw.abrufe.length;
    const r = await sw.asset("/_next/static/chunks/offline.js");
    expect(await r!.text()).toBe("console.log(1)");
    expect(sw.abrufe.length).toBe(vorher);
  });

  it("kappt den Laufzeit-Cache und wirft die ältesten Einträge zuerst hinaus", async () => {
    const sw = ladeServiceWorker(async () => antwort("x"));
    for (let i = 0; i < 105; i++) await sw.asset(`/_next/static/chunks/c${i}.js`);
    const laufzeit = await sw.caches.open("cornice-shell-build-a-laufzeit");
    const urls = laufzeit.urls();
    expect(urls).toHaveLength(100);
    expect(urls).not.toContain("/_next/static/chunks/c0.js");
    expect(urls).toContain("/_next/static/chunks/c104.js");
  });

  it("kümmert sich nicht um fremde Origins (Mapbox, Supabase)", async () => {
    const sw = ladeServiceWorker(server());
    // Kein respondWith → der Browser holt selbst, der Worker legt nichts ab.
    const r = await sw.anfrage(new Request("https://api.mapbox.com/v4/tiles/1.pbf"));
    expect(r).toBeUndefined();
    expect(sw.abrufe).toEqual([]);
    expect(await sw.caches.keys()).toEqual([]);
  });
});

describe("public/sw.js — assetUrlsAus", () => {
  it("erkennt absolute und präfixlose Verweise und nur eigene Build-Assets", () => {
    const sw = ladeServiceWorker(server());
    const urls = sw.kontext.assetUrlsAus(
      `<script src="/_next/static/chunks/a.js"></script> "static/chunks/b.js"
       <link rel="preload" href="/_next/static/media/c-s.p.woff2" as="font">
       <link rel="stylesheet" href="/_next/static/chunks/d.css">
       <script src="/_next/static/chunks/a.js"></script>
       url(../media/e.woff2) <img src="/icon/192"> https://api.mapbox.com/x.js`,
      ORIGIN,
    );
    expect(urls.map((u) => u.replace(ORIGIN, "")).sort()).toEqual(
      [
        "/_next/static/chunks/a.js",
        "/_next/static/chunks/b.js",
        "/_next/static/chunks/d.css",
        "/_next/static/media/c-s.p.woff2",
      ].sort(),
    );
  });
});
