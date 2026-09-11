"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { RouteTimeEntry } from "@/lib/leaderboard";
import { MEDAL_COLORS } from "@/lib/constants";
import Avatar from "@/components/Avatar";
import Card from "@/components/ui/Card";
import MotorklassenChips from "@/components/MotorklassenChips";
import { motorklassendefinition } from "@/lib/motorklassen";
import type { Motorklasse } from "@/types/database";
import { cn } from "@/lib/utils/cn";

const SICHTBAR = 5;

// Die Bestzeiten einer Strecke, seit den Motorklassen (0080) nach Klasse
// filterbar.
//
// Der ungefilterte Stand kommt weiterhin serverseitig herein: Die erste
// Ansicht ist damit sofort vollständig, ohne Ladezustand. Erst ein Klick auf
// einen Klassen-Chip holt nach — über denselben öffentlichen Endpunkt, den
// der Chooser auf /leaderboards schon benutzt.
//
// Bewusst über Client-State statt über ?klasse= in der URL: Die Streckenseite
// lädt Karte, Fotos, Bewertungen und Wetter mit, und die alle bei jedem
// Chip-Tipp neu zu berechnen wäre teuer für einen Filter, der nur eine
// Kartenliste betrifft. Auf /leaderboards, wo die globalen Listen die Seite
// ausmachen, gilt das umgekehrt.
export default function RouteLeaderboardPreview({
  routeId,
  entries,
  klassen,
}: {
  routeId: string;
  entries: RouteTimeEntry[];
  klassen: Motorklasse[];
}) {
  const [klasse, setKlasse] = useState<Motorklasse | null>(null);
  const [gefiltert, setGefiltert] = useState<RouteTimeEntry[]>([]);
  // Wird nur im Fetch-Callback gesetzt, nie synchron im Effekt-Rumpf —
  // "laedt" ergibt sich daraus als abgeleiteter Wert. Gleiches Muster wie in
  // TrackLeaderboardChooser.
  const [geholteKlasse, setGeholteKlasse] = useState<Motorklasse | null>(null);
  const laedt = klasse !== null && geholteKlasse !== klasse;

  useEffect(() => {
    // "Alle" braucht keinen Aufruf: diese Liste kam schon serverseitig mit.
    if (klasse === null) return;
    let abgebrochen = false;
    fetch(`/api/strecken/${routeId}/leaderboard?klasse=${klasse}`)
      .then((r) => r.json())
      .then((data: { entries?: RouteTimeEntry[] }) => {
        if (abgebrochen) return;
        setGefiltert(data.entries ?? []);
        setGeholteKlasse(klasse);
      })
      .catch(() => {
        if (abgebrochen) return;
        setGefiltert([]);
        setGeholteKlasse(klasse);
      });
    return () => {
      abgebrochen = true;
    };
  }, [klasse, routeId]);

  const sichtbar = (klasse === null ? entries : gefiltert).slice(0, SICHTBAR);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Bestzeiten</h2>

      <MotorklassenChips
        klassen={klassen}
        aktiv={klasse}
        onChange={setKlasse}
        label="Bestzeiten nach Motorklasse filtern"
      />

      {sichtbar.length === 0 ? (
        <p className={cn("text-sm text-muted transition-opacity", laedt && "opacity-40")}>
          {klasse === null
            ? "Noch keine geteilten Bestzeiten für diese Strecke."
            : `Noch keine Zeit in ${motorklassendefinition(klasse).label} auf dieser Strecke — du kannst die erste sein.`}
        </p>
      ) : (
        <Card
          as="ol"
          className={cn("divide-y divide-border transition-opacity", laedt && "opacity-40")}
        >
          {sichtbar.map((entry, i) => (
            <li key={entry.completionId} className="flex items-center gap-3 px-4 py-3 text-sm">
              {i < 3 ? (
                <span className="flex w-4 shrink-0 justify-center">
                  <Trophy className="h-4 w-4" style={{ color: MEDAL_COLORS[i] }} aria-hidden="true" />
                  <span className="sr-only">Platz {i + 1}</span>
                </span>
              ) : (
                <span className="w-4 shrink-0 text-center font-mono text-xs text-muted">{i + 1}.</span>
              )}
              <Avatar url={entry.avatarUrl} name={entry.name} size={24} />
              <Link
                href={`/fahrer/${entry.userId}`}
                className="min-w-0 flex-1 truncate transition-colors duration-fast hover:text-accent"
              >
                {entry.name}
              </Link>
              {/* Die Klasse nur in der Gesamtliste: in einer Klassenliste
                  trüge sie an jeder Zeile denselben Wert. */}
              {klasse === null && entry.klasse && (
                <span className="shrink-0 font-mono text-xs text-muted">
                  {motorklassendefinition(entry.klasse).label}
                </span>
              )}
              <span className="shrink-0 font-mono tabular-nums text-muted">
                {formatDuration(entry.dauerSekunden)}
              </span>
            </li>
          ))}
        </Card>
      )}
    </div>
  );
}
