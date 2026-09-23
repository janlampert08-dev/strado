"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { erzeugeGeometrieLader } from "@/lib/streckenGeometrie";
import type { KartenStrecke } from "@/types/database";

// Ein Lader für die ganze Seite: Karte, Aufzeichnung, GPX-Export und
// Offline-Knopf teilen sich denselben Abruf (lib/streckenGeometrie.ts).
// credentials "same-origin": private Strecken liest der Endpunkt mit der
// Sitzung, genau wie die Seite.
const lader = erzeugeGeometrieLader((url) => fetch(url, { credentials: "same-origin" }));

interface Quelle {
  streckenId: string;
  url: string;
}

const VolleGeometrieKontext = createContext<Quelle | null>(null);

// Die Streckenseite legt fest, für welche Strecke unter welcher Adresse die
// volle Linie liegt. Ausserhalb (Startseite, freie Fahrt) gibt es keinen
// Anbieter — dort bleibt jede Strecke, wie sie hereinkommt.
export function VolleGeometrieProvider({
  streckenId,
  url,
  children,
}: {
  streckenId: string;
  url: string;
  children: ReactNode;
}) {
  const quelle = useMemo(() => ({ streckenId, url }), [streckenId, url]);
  return <VolleGeometrieKontext.Provider value={quelle}>{children}</VolleGeometrieKontext.Provider>;
}

export type GeometrieStand = "voll" | "laedt" | "fehlgeschlagen" | "ohne-quelle";

/**
 * Die Strecke mit der vollen Linie, sobald sie geladen ist — bis dahin die
 * hereingereichte (auf der Streckenseite die Übersichtslinie aus 0117).
 * Betrifft nur die Strecke, für die der Anbieter die Adresse kennt; jede
 * andere (etwa Kontext-Strecken) kommt unverändert zurück.
 *
 * `laden()` wartet auf die volle Linie, für Handlungen, die sie brauchen
 * (GPX-Export, Offline speichern). Es wirft, wenn sie nicht zu bekommen ist.
 */
export function useVolleGeometrie<T extends KartenStrecke>(
  strecke: T,
): { strecke: T; stand: GeometrieStand; laden: () => Promise<T> } {
  const quelle = useContext(VolleGeometrieKontext);
  const url = quelle && quelle.streckenId === strecke.id ? quelle.url : null;

  const [geladen, setGeladen] = useState<{ url: string; punkte: [number, number][] } | null>(() =>
    url && lader.bekannt(url) ? { url, punkte: lader.bekannt(url)! } : null,
  );
  const [fehlerUrl, setFehlerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url || geladen?.url === url) return;
    let abgebrochen = false;
    lader.laden(url).then(
      (punkte) => {
        if (!abgebrochen) setGeladen({ url, punkte });
      },
      () => {
        if (!abgebrochen) setFehlerUrl(url);
      },
    );
    return () => {
      abgebrochen = true;
    };
  }, [url, geladen?.url]);

  const punkte = url && geladen?.url === url ? geladen.punkte : null;

  const ergebnis = useMemo(
    () => (punkte ? mitLinie(strecke, punkte) : strecke),
    [strecke, punkte],
  );

  const stand: GeometrieStand = !url
    ? "ohne-quelle"
    : punkte
      ? "voll"
      : fehlerUrl === url
        ? "fehlgeschlagen"
        : "laedt";

  const laden = useMemo(
    () => async () => {
      if (!url) return strecke;
      return mitLinie(strecke, await lader.laden(url));
    },
    [url, strecke],
  );

  return { strecke: ergebnis, stand, laden };
}

function mitLinie<T extends KartenStrecke>(strecke: T, punkte: [number, number][]): T {
  return { ...strecke, geometry_geojson: { type: "LineString", coordinates: punkte } };
}

/**
 * Nur die Ladefunktion, für Stellen ohne KartenStrecke (der Offline-Knopf
 * speichert eine eigene Form, lib/offlineRoutes.ts). null, wenn die Seite für
 * diese Strecke keine Adresse kennt.
 */
export function useVolleLinieLaden(streckenId: string): (() => Promise<[number, number][]>) | null {
  const quelle = useContext(VolleGeometrieKontext);
  const url = quelle && quelle.streckenId === streckenId ? quelle.url : null;
  return useMemo(() => (url ? () => lader.laden(url) : null), [url]);
}
