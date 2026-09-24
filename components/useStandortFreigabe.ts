"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { erkenneGeraet, type Geraet } from "@/lib/geraet";
import {
  abonniereErsteFahrtHinweise,
  ersteFahrtHinweiseGesehen,
} from "@/lib/ersteFahrt";

/**
 * Der Stand der Standortfreigabe, ohne danach zu fragen.
 *
 * "unbekannt" heisst: der Browser verrät es nicht (keine Permissions API)
 * oder die Antwort steht noch aus. Dann verhält sich die Oberfläche wie bei
 * "prompt" — erklären, und die eigentliche Frage erst beim Tippen auf Start.
 *
 * Der Grund für den Umweg: bisher fragte /fahrten/neu beim blossen Öffnen
 * nach dem Standort (für das Zentrieren der Karte). Die Browserfrage kam
 * damit ohne Zusammenhang, bevor jemand etwas getan hatte — und ein "Nein"
 * dort ist auf dem iPhone praktisch endgültig.
 */
export type StandortFreigabe = "unbekannt" | "granted" | "prompt" | "denied";

export function useStandortFreigabe(): StandortFreigabe {
  const [freigabe, setFreigabe] = useState<StandortFreigabe>("unbekannt");

  useEffect(() => {
    if (!("permissions" in navigator) || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    let abgebrochen = false;
    const uebernehmen = () => {
      if (status && !abgebrochen) setFreigabe(status.state as StandortFreigabe);
    };
    navigator.permissions
      .query({ name: "geolocation" })
      .then((s) => {
        status = s;
        uebernehmen();
        s.addEventListener("change", uebernehmen);
      })
      // Ältere Safari-Versionen kennen "geolocation" hier nicht und werfen.
      .catch(() => {});
    return () => {
      abgebrochen = true;
      status?.removeEventListener("change", uebernehmen);
    };
  }, []);

  return freigabe;
}

// Das Gerät ändert sich während eines Besuchs nicht — einmal lesen, danach
// dieselbe Referenz (useSyncExternalStore verlangt einen stabilen Wert).
let geraetCache: Geraet | null = null;

function leseGeraet(): Geraet {
  if (!geraetCache) {
    geraetCache = erkenneGeraet({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      standalone:
        window.matchMedia?.("(display-mode: standalone)").matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    });
  }
  return geraetCache;
}

const nichtsZuAbonnieren = () => () => {};

/** null beim Server-Rendern und im ersten Hydrierungsdurchlauf. */
export function useGeraet(): Geraet | null {
  return useSyncExternalStore(nichtsZuAbonnieren, leseGeraet, () => null);
}

/**
 * Ob die Hinweise vor der ersten Fahrt auf diesem Gerät schon gezeigt
 * wurden. Auf dem Server "true": lieber einen Durchlauf lang die knappe
 * Fassung zeigen, als die lange aufblitzen und wieder verschwinden lassen.
 */
export function useErsteFahrtHinweiseGesehen(): boolean {
  return useSyncExternalStore(abonniereErsteFahrtHinweise, ersteFahrtHinweiseGesehen, () => true);
}
