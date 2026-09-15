// Minimaler Service Worker: sorgt nur dafür, dass die App bei fehlendem
// Netzwerk eine gebrandete Offline-Seite statt des nativen Browser-Fehlers
// zeigt, und dass statische Build-Assets aus dem Cache statt erneut vom
// Netz kommen. Bewusst kein Versuch, dynamische Seiten (Streckendetails,
// Profile, API-Routen) offline verfügbar zu machen — die brauchen
// Live-Daten/Auth, ein Cache davon wäre potenziell falsch oder stale.
const CACHE_NAME = "cornice-shell-v1";
// Welche Caches diesem Service Worker gehören. Braucht es, weil der
// activate-Handler unten aufräumt: er löschte bisher JEDEN Cache der Origin,
// der nicht CACHE_NAME hiess — und das ist nicht nur der eigene Vorgänger.
// mapbox-gl hält seine Kacheln in einem eigenen Cache namens "mapbox-tiles";
// der fiel bei jeder Aktivierung mit weg und wurde danach neu aus dem Netz
// gefüllt. Mapbox rechnet pro Kachelabruf ab, und unterwegs zahlt die
// Nutzerin zusätzlich mit Mobildaten und Wartezeit.
//
// Nachgewiesen im Browser: ein eigens angelegter Fremd-Cache war nach einer
// erzwungenen Neuinstallation des Service Workers verschwunden.
//
// Der Name behält bewusst das alte Produktkürzel. Er ist zugleich der
// Aufräum-Schlüssel, und ein Umbenennen gehört zu der grösseren Frage, was
// mit den übrigen "cornice"-Speicherschlüsseln geschieht (Theme, Fahrt-
// Schnappschüsse, IndexedDB) — die hängen an Nutzerzustand, nicht an Text.
const EIGENE_CACHES = /^cornice-shell-/;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => EIGENE_CACHES.test(key) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation (Seitenaufruf): Netz zuerst, damit Nutzer immer die aktuelle,
  // authentifizierte Seite sehen — nur bei Netzwerkfehler auf die gecachte
  // Offline-Seite zurückfallen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((res) => res ?? Response.error())),
    );
    return;
  }

  // Fingerprinted Build-Assets ändern sich nie unter derselben URL —
  // cache-first ist hier sicher und spart wiederholte Netzwerk-Requests.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
