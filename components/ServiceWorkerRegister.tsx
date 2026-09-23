"use client";

import { useEffect } from "react";
import { serviceWorkerUrl } from "@/lib/serviceWorker";

// Nur in Produktion registrieren — in der Entwicklung (next dev/Turbopack)
// würde ein Service Worker eigene, potenziell veraltete Caches von Build-
// Assets anlegen und mit dem Hot-Module-Reloading kollidieren.
//
// Die Build-Kennung in der URL (?v=…) macht jeden Deploy zu einer neuen
// Skript-URL, also zu einer Neuinstallation mit eigenem Cache — siehe
// lib/serviceWorker.ts. STRADO_BUILD_KENNUNG setzt next.config.ts beim Build.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(serviceWorkerUrl(process.env.STRADO_BUILD_KENNUNG)).catch(() => {
      // Keine Fehlerbehandlung nötig — ohne Service Worker läuft die App
      // einfach ohne die Offline-Fallback-Seite/Asset-Cache weiter.
    });
  }, []);

  return null;
}
