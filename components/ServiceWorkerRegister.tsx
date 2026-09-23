"use client";

import { useEffect } from "react";
import { lauscheAufInstallationsAngebot } from "@/lib/installation";

// Nur in Produktion registrieren — in der Entwicklung (next dev/Turbopack)
// würde ein Service Worker eigene, potenziell veraltete Caches von Build-
// Assets anlegen und mit dem Hot-Module-Reloading kollidieren.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Keine Fehlerbehandlung nötig — ohne Service Worker läuft die App
      // einfach ohne die Offline-Fallback-Seite/Asset-Cache weiter.
    });
  }, []);

  // Das Installationsangebot des Browsers festhalten, egal auf welcher Seite
  // es kommt — gezeigt wird es erst nach einer gespeicherten Fahrt
  // (components/NachDerFahrt.tsx). Auch in der Entwicklung, anders als der
  // Service Worker oben: hier wird nichts gecacht.
  useEffect(() => lauscheAufInstallationsAngebot(), []);

  return null;
}
