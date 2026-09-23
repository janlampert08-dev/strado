"use client";

import { useEffect, useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import ElevationProfile from "@/components/ElevationProfile";
import Card from "@/components/ui/Card";
import { angefragteStreckenId } from "@/lib/offlineAnsicht";
import { routeShapePath, routeShapePoints } from "@/lib/routeShape";
import {
  getAllOfflineRoutes,
  isIndexedDbAvailable,
  removeOfflineRoute,
  type OfflineRoute,
} from "@/lib/offlineRoutes";

// Zeigt Strecken, die per OfflineRouteButton.tsx (Routendetailseite) explizit
// für offline gespeichert wurden — reine Anzeige bereits lokal vorliegender
// Daten (IndexedDB), kein Netzwerkzugriff nötig. Läuft auf app/offline/page.tsx,
// die vom Service Worker (public/sw.js) bei fehlendem Netz als Fallback
// ausgeliefert wird, ist also selbst offline erreichbar.
export default function OfflineRoutesList() {
  // Startet immer bei null, auch in Browsern ohne IndexedDB — ein vom
  // Environment abhängiger Lazy-Initializer würde Server (kein indexedDB in
  // Node) und Client unterschiedlich rendern (leerer Zustand vs. nichts) und
  // damit einen echten Hydration-Mismatch auslösen. Im (praktisch nie
  // vorkommenden) Fall ohne IndexedDB bleibt routes für immer null und die
  // Komponente zeigt dauerhaft nichts — dieselbe bewusste Vereinfachung wie
  // in OfflineRouteButton.tsx.
  const [routes, setRoutes] = useState<OfflineRoute[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isIndexedDbAvailable()) return;
    getAllOfflineRoutes()
      .then((gespeichert) => {
        setRoutes(gespeichert);
        // Kam diese Seite als Ersatz für eine gespeicherte Streckenseite,
        // gleich deren Detail zeigen (siehe lib/offlineAnsicht.ts).
        const angefragt = angefragteStreckenId(window.location.pathname);
        if (angefragt && gespeichert.some((r) => r.id === angefragt)) setSelectedId(angefragt);
      })
      .catch(() => setRoutes([]));
  }, []);

  async function handleRemove(id: string) {
    await removeOfflineRoute(id);
    setRoutes((current) => current?.filter((r) => r.id !== id) ?? null);
    setSelectedId((current) => (current === id ? null : current));
  }

  if (routes === null) return null;

  if (routes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-sm text-muted">
        <MapPin className="h-6 w-6" aria-hidden="true" />
        Keine Strecken offline verfügbar.
      </div>
    );
  }

  const selected = routes.find((r) => r.id === selectedId) ?? null;

  if (selected) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4 text-left">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="self-start text-sm text-muted hover:text-foreground"
        >
          ← Zurück zur Liste
        </button>
        <div>
          <p className="text-sm text-muted">{selected.region}</p>
          <h2 className="text-title font-semibold">{selected.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {selected.startOrt} → {selected.zielOrt}
          </p>
        </div>
        <StreckenVerlauf coordinates={selected.geometryCoordinates} name={selected.name} />
        {selected.hoehenprofil && selected.hoehenprofil.length > 1 && (
          <ElevationProfile punkte={selected.hoehenprofil} />
        )}
        <dl className="grid grid-cols-2 gap-3">
          <Card surface className="flex flex-col gap-1 p-3">
            <dt className="text-xs text-muted">Länge</dt>
            <dd className="text-sm tabular-nums">{selected.laengeKm} km</dd>
          </Card>
          <Card surface className="flex flex-col gap-1 p-3">
            <dt className="text-xs text-muted">Höchster Punkt</dt>
            <dd className="text-sm tabular-nums">{selected.hoeheM ?? "—"} m</dd>
          </Card>
          <Card surface className="flex flex-col gap-1 p-3">
            <dt className="text-xs text-muted">Max. Steigung</dt>
            <dd className="text-sm tabular-nums">
              {selected.maxSteigungProzent !== null ? `${selected.maxSteigungProzent}%` : "—"}
            </dd>
          </Card>
          <Card surface className="flex flex-col gap-1 p-3">
            <dt className="text-xs text-muted">Kehren</dt>
            <dd className="text-sm tabular-nums">{selected.kehren ?? "—"}</dd>
          </Card>
        </dl>
        {selected.charakterText && (
          <p className="text-sm leading-relaxed text-foreground">{selected.charakterText}</p>
        )}
        <button
          type="button"
          onClick={() => handleRemove(selected.id)}
          className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Von Offline entfernen
        </button>
      </div>
    );
  }

  return (
    <Card as="ul" className="w-full max-w-sm divide-y divide-border text-left">
      {routes.map((route) => {
        const shape = routeShapePath(route.geometryCoordinates, 64, 48, 4);
        return (
          <li key={route.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedId(route.id)}
              className="flex flex-1 items-center gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-surface"
            >
              <svg viewBox="0 0 64 48" className="h-8 w-11 shrink-0 text-accent" aria-hidden="true">
                <path
                  d={shape}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{route.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {route.laengeKm} km
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleRemove(route.id)}
              aria-label={`${route.name} von Offline entfernen`}
              className="shrink-0 px-3 text-muted hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </Card>
  );
}

// Ersatz für die Karte: Mapbox-Kacheln werden bewusst nicht offline
// gehalten (Nutzungsbedingungen, siehe lib/offlineRoutes.ts), die Geometrie
// liegt aber ohnehin in IndexedDB. Die Linie zeigt Form und Richtung der
// Strecke — Start als offener, Ziel als gefüllter Punkt —, nicht den Ort.
function StreckenVerlauf({ coordinates, name }: { coordinates: [number, number][]; name: string }) {
  const punkte = routeShapePoints(coordinates, 320, 200, 14);
  if (punkte.length < 2) return null;
  const pfad = `M${punkte.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`;
  const [startX, startY] = punkte[0];
  const [zielX, zielY] = punkte[punkte.length - 1];

  return (
    <Card surface className="p-2">
      <svg
        viewBox="0 0 320 200"
        className="h-auto w-full text-accent"
        role="img"
        aria-label={`Streckenverlauf ${name}`}
      >
        <path
          d={pfad}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={startX} cy={startY} r={5} className="fill-background" stroke="currentColor" strokeWidth={2.5} />
        <circle cx={zielX} cy={zielY} r={5} fill="currentColor" />
      </svg>
    </Card>
  );
}
