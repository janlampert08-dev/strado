"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDauer, mitAnzahl } from "@/lib/format";
import type { RouteTimeEntry } from "@/lib/leaderboard";
import Avatar from "@/components/Avatar";
import { RankingIcon } from "@/components/NavIcons";
import Card from "@/components/ui/Card";
import MotorklassenChips from "@/components/MotorklassenChips";
import { filterImSatz, istFahrzeugTyp, motorklassendefinition } from "@/lib/motorklassen";
import type { Klassenfilter } from "@/lib/motorklassen";
import type { Motorklasse } from "@/types/database";
import { cn } from "@/lib/utils/cn";
import SectionHeading from "@/components/ui/SectionHeading";

const SICHTBAR = 5;

// Die Bestzeiten einer Strecke, seit den Motorklassen (0080) nach Klasse
// filterbar.
//
// Der ungefilterte Stand kommt weiterhin serverseitig herein: Die erste
// Ansicht ist damit sofort vollständig, ohne Ladezustand. Erst ein Klick auf
// einen Klassen-Chip holt nach — über denselben öffentlichen Endpunkt, den
// der Chooser auf /ranglisten schon benutzt.
//
// Bewusst über Client-State statt über ?klasse= in der URL: Die Streckenseite
// lädt Karte, Fotos, Bewertungen und Wetter mit, und die alle bei jedem
// Chip-Tipp neu zu berechnen wäre teuer für einen Filter, der nur eine
// Kartenliste betrifft. Auf /ranglisten, wo die globalen Listen die Seite
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
  // Klassenfilter statt Motorklasse: die Auswahl kann ein ganzer
  // Fahrzeugtyp sein ("Autos") oder ein Leistungsband darin.
  const [klasse, setKlasse] = useState<Klassenfilter | null>(null);
  const [gefiltert, setGefiltert] = useState<RouteTimeEntry[]>([]);
  // Wird nur im Fetch-Callback gesetzt, nie synchron im Effekt-Rumpf —
  // "laedt" ergibt sich daraus als abgeleiteter Wert. Gleiches Muster wie in
  // TrackLeaderboardChooser.
  const [geholteKlasse, setGeholteKlasse] = useState<Klassenfilter | null>(null);
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

  const liste = klasse === null ? entries : gefiltert;
  const sichtbar = liste.slice(0, SICHTBAR);
  // Vorspann für den Wertungs-Reiter der Streckenseite: Wer die Liste nicht
  // öffnet, sieht trotzdem, dass es Zeiten gibt — und welche die schnellste
  // ist. Aus denselben Props wie die Liste, ohne zusätzliche Abfrage.
  const beste =
    liste.length > 0 ? Math.min(...liste.map((e) => e.dauerSekunden)) : null;

  return (
    <div className="flex flex-col gap-3">
      <SectionHeading icon={RankingIcon}>Bestzeiten</SectionHeading>

      <MotorklassenChips
        klassen={klassen}
        aktiv={klasse}
        onChange={setKlasse}
        label="Bestzeiten nach Fahrzeugtyp filtern"
      />

      {beste !== null && (
        <p className={cn("text-sm text-muted tabular-nums", laedt && "opacity-40")}>
          Bestzeit {formatDauer(beste)} · {mitAnzahl(liste.length, "Zeit", "Zeiten")}
        </p>
      )}

      {sichtbar.length === 0 ? (
        <p className={cn("text-sm text-muted transition-opacity", laedt && "opacity-40")}>
          {klasse === null
            ? "Noch keine Bestzeit auf dieser Strecke. Zeichne sie auf und teil die Fahrt, dann kannst du der Erste sein."
            : `Noch keine Zeit ${filterImSatz(klasse)} auf dieser Strecke. Du kannst der Erste sein.`}{" "}
          {/* Der Startknopf steht in der festen Fussleiste derselben Seite
              (#fahren in components/RouteDetailLayout.tsx) und ist damit
              immer im Blick; der Link fokussiert ihn für die Tastatur. */}
          <a href="#fahren" className="text-accent-ink underline-offset-4 hover:underline">
            Zum Start
          </a>
        </p>
      ) : (
        <Card
          as="ol"
          className={cn("divide-y divide-border transition-opacity", laedt && "opacity-40")}
        >
          {sichtbar.map((entry, i) => (
            <li key={entry.completionId} className="flex items-center gap-3 px-4 py-3 text-sm">
              {/* Der Rang als Zahl in jeder Zeile. Vorher trugen die ersten drei
                  je einen gleich geformten Pokal, unterschieden nur durch Gold, Silber
                  und Bronze — Silber hatte auf hellem Grund 2.3:1, und wer die Farben
                  nicht trennt, sah dreimal dasselbe (WCAG 1.4.1). Die ersten drei
                  sind betont, nicht eingefärbt. */}
              <span
                className={`w-5 shrink-0 text-center text-xs tabular-nums ${i < 3 ? "font-semibold text-foreground" : "text-muted"}`}
              >
                <span className="sr-only">Platz </span>
                {i + 1}
              </span>
              <Avatar url={entry.avatarUrl} name={entry.name} size={24} />
              <Link
                href={`/fahrer/${entry.userId}`}
                className="relative flex min-w-0 flex-1 items-center transition-colors duration-fast hover:text-accent-ink after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']"
              >
                <span className="truncate">{entry.name}</span>
              </Link>
              {/* Die Klasse überall ausser in einer Klassenliste: dort
                  trüge sie an jeder Zeile denselben Wert. In der Typliste
                  ("Autos") stehen dagegen drei Bänder nebeneinander, und
                  welches eine Zeit gefahren hat, ist dort die Auskunft, auf
                  die es ankommt. */}
              {(klasse === null || istFahrzeugTyp(klasse)) && entry.klasse && (
                <span className="shrink-0 text-xs text-muted">
                  {motorklassendefinition(entry.klasse).label}
                </span>
              )}
              <span className="shrink-0 tabular-nums text-muted">
                {formatDauer(entry.dauerSekunden)}
              </span>
            </li>
          ))}
        </Card>
      )}
    </div>
  );
}
