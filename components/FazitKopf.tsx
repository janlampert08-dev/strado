"use client";

import dynamic from "next/dynamic";
import Skeleton from "@/components/ui/Skeleton";
import { dauerTeile } from "@/lib/format";

const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const KEINE_STRECKEN: never[] = [];

/**
 * Der Kopf des Fazit-Schirms, geteilt von FreeRideForm und LiveTrackingForm.
 *
 * DER MOMENT NACH DER FAHRT war der schwächste der App: eine kleine
 * Abschnittsmarke "Fazit" und drei Werte in 18 px, keine Karte — und direkt
 * darunter die Bitte um ein Konto. Im Re-Review 2026-09-17 als P1 benannt:
 * das Ende einer Fahrt ist der Moment, an den man sich erinnert, und für
 * Gäste zugleich der eine Moment, in dem ein Konto einen Grund hat.
 *
 * Jetzt führt die gefahrene Linie, gezeichnet aus dem Trail, den der Recorder
 * beim Stoppen veröffentlicht (nur lokal, nichts wird dafür gesendet), und
 * die drei Werte stehen in Anzeigegrösse darunter. Eine Streckenfahrt legt
 * die Strecke nicht mit auf die Karte: hier geht es um die eigene Linie.
 */
export default function FazitKopf({
  titel,
  trail,
  distanzKm,
  sekunden,
}: {
  titel: string;
  trail: [number, number][];
  distanzKm: number;
  sekunden: number;
}) {
  const tempo = sekunden > 0 ? distanzKm / (sekunden / 3600) : null;
  const werte = [
    { beschriftung: "Distanz", wert: distanzKm.toFixed(1), einheit: "km" },
    { beschriftung: "Zeit", ...dauerTeile(sekunden) },
    { beschriftung: "Ø Tempo", wert: tempo !== null ? tempo.toFixed(0) : "—", einheit: "km/h" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display font-semibold tracking-tight">{titel}</h1>
      {trail.length > 1 && (
        <div className="h-48 overflow-hidden rounded-lg bg-surface sm:h-56">
          <RouteMap
            routes={KEINE_STRECKEN}
            trail={trail}
            fitTrail
            routesClickable={false}
            ohneBedienelemente
          />
        </div>
      )}
      <dl className="grid grid-cols-3 gap-3">
        {werte.map((w) => (
          <div key={w.beschriftung} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs text-muted">{w.beschriftung}</dt>
            <dd className="text-3xl leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums">
              {w.wert}
              {w.einheit && (
                <span className="ml-1 text-sm font-medium tracking-normal text-muted">{w.einheit}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
