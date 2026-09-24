"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// Ob gerade eine Streckenaufzeichnung läuft (GefahrenSection geöffnet).
// RouteDetailLayout blendet dann die Detailkarte dahinter aus: Sie läge sonst
// als zweite WebGL-Karte unter dem Vollbild-Dialog der Aufzeichnung —
// unsichtbar, aber mit eigenem Kontext, Kachel-Nachschub und Terrain-Quelle.
// Auf dem Telefon war genau das der spürbare Unterschied zur freien Fahrt,
// die immer nur eine Karte gleichzeitig betreibt
// (app/fahrten/neu/page.tsx). Sobald die Aufzeichnung zu ist (zurück,
// verworfen oder gespeichert), hängt sich die Detailkarte wieder ein.
const AufzeichnungsKontext = createContext<{
  aktiv: boolean;
  setzeAktiv: (aktiv: boolean) => void;
} | null>(null);

export function AufzeichnungProvider({ children }: { children: ReactNode }) {
  const [aktiv, setzeAktiv] = useState(false);
  const wert = useMemo(() => ({ aktiv, setzeAktiv }), [aktiv]);
  return <AufzeichnungsKontext.Provider value={wert}>{children}</AufzeichnungsKontext.Provider>;
}

export function useAufzeichnung(): {
  aktiv: boolean;
  setzeAktiv: (aktiv: boolean) => void;
} {
  const kontext = useContext(AufzeichnungsKontext);
  if (!kontext) {
    throw new Error("useAufzeichnung braucht einen AufzeichnungProvider (siehe Streckenseite).");
  }
  return kontext;
}
