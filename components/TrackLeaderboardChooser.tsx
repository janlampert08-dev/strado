"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDuration } from "@/lib/format";
import type { RouteTimeEntry } from "@/lib/leaderboard";
import { fieldClassName } from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import MotorklassenChips from "@/components/MotorklassenChips";
import { motorklassendefinition } from "@/lib/motorklassen";
import type { Motorklasse } from "@/types/database";
import { cn } from "@/lib/utils/cn";

const COLLAPSED_SIZE = 5;
const EXPANDED_SIZE = 10;

export default function TrackLeaderboardChooser({
  routes,
}: {
  routes: { id: string; name: string }[];
}) {
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "");
  const [klasse, setKlasse] = useState<Motorklasse | null>(null);
  const [entries, setEntries] = useState<RouteTimeEntry[]>([]);
  // Die auf dieser Strecke belegten Klassen kommen aus derselben Antwort und
  // sind vom Filter unabhängig — sonst bliebe nach der ersten Auswahl nur
  // noch die gewählte Klasse in der Leiste stehen.
  const [klassen, setKlassen] = useState<Motorklasse[]>([]);
  // Wird nur innerhalb des Fetch-Callbacks gesetzt (nie synchron im
  // Effekt-Body) — "loading" ergibt sich daraus als abgeleiteter Wert,
  // statt ein eigener State zu sein, den der Effekt direkt setzen müsste.
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const key = `${routeId}:${klasse ?? ""}`;
  const loading = routeId !== "" && fetchedKey !== key;

  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    const abfrage = klasse ? `?klasse=${klasse}` : "";
    fetch(`/api/strecken/${routeId}/leaderboard${abfrage}`)
      .then((r) => r.json())
      .then((data: { entries?: RouteTimeEntry[]; klassen?: Motorklasse[] }) => {
        if (cancelled) return;
        setEntries(data.entries ?? []);
        setKlassen(data.klassen ?? []);
        setFetchedKey(`${routeId}:${klasse ?? ""}`);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setFetchedKey(`${routeId}:${klasse ?? ""}`);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, klasse]);

  const visible = entries.slice(0, expanded ? EXPANDED_SIZE : COLLAPSED_SIZE);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
          Streckenbestzeiten
        </h2>
        {routes.length > 0 && (
          <select
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value);
              // Die Klassen der neuen Strecke sind andere — mit einer
              // Auswahl stehenzubleiben, die es dort nicht gibt, ergäbe eine
              // leere Liste ohne erkennbaren Grund.
              setKlasse(null);
              setKlassen([]);
              setExpanded(false);
            }}
            className={fieldClassName("w-full sm:w-auto sm:max-w-[60%]")}
          >
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <MotorklassenChips
        klassen={klassen}
        aktiv={klasse}
        onChange={(naechste) => {
          setKlasse(naechste);
          setExpanded(false);
        }}
        label="Streckenbestzeiten nach Motorklasse filtern"
      />

      {routes.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Strecken vorhanden.</p>
      ) : entries.length === 0 ? (
        <p className={`text-sm text-muted transition-opacity ${loading ? "opacity-40" : ""}`}>
          {klasse === null
            ? "Noch keine geteilten Zeiten für diese Strecke."
            : `Noch keine Zeit in ${motorklassendefinition(klasse).label} auf dieser Strecke — du kannst die erste sein.`}
        </p>
      ) : (
        <>
          {/* Bleibt beim Streckenwechsel sichtbar (nur abgedunkelt), statt
              beim Laden kurz auf Platzhalter zu blitzen. */}
          <Card as="ol" className={cn("divide-y divide-border transition-opacity", loading && "opacity-40")}>
            {visible.map((entry, i) => (
              <li
                key={entry.completionId}
                className="flex items-baseline justify-between px-4 py-3 text-sm"
              >
                <span>
                  <span className="mr-2 font-mono text-muted tabular-nums">{i + 1}.</span>
                  <Link
                    href={`/fahrer/${entry.userId}`}
                    className="transition-colors duration-fast hover:text-accent"
                  >
                    {entry.name}
                  </Link>
                </span>
                <span className="font-mono tabular-nums text-accent">
                  {formatDuration(entry.dauerSekunden)}
                </span>
              </li>
            ))}
          </Card>
          {entries.length > COLLAPSED_SIZE && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-xs text-accent hover:underline"
            >
              {expanded ? "Weniger anzeigen" : "Top 10 anzeigen"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
