import { TimerIcon } from "@/components/NavIcons";
import { dauerTeile } from "@/lib/format";
import type { RouteTimeEntry } from "@/lib/leaderboard";

// Die Bestzeit einer Strecke, sichtbar ohne Reiterwechsel. Sie stand im
// Reiter "Wertung" zwischen Sternen und Kommentaren, und dessen Zähler
// zählte die Bewertungen, nicht die Zeiten — wer die Seite öffnete, um zu
// sehen, was hier gefahren wurde, fand es erst im dritten Reiter und dort
// unter einem Filter.
//
// Zwei Zahlen nebeneinander, kein Abstand zwischen ihnen: Die eigene
// Bestzeit ist privat (getPersonalBestSeconds, RLS nur eigene Zeilen), und
// ein "+0:51" gegen die Bestzeit wäre genau der Vergleich, den AGB Ziff.
// 11.3 in der geltenden Fassung ausschliesst. Er kommt mit der neuen
// Fassung, nicht vorher.
//
// Ohne jede Zeit steht nichts da: Eine leere Bestzeit auf einer frischen
// Strecke ist kein Befund, und der Reiter "Bestzeiten" lädt ohnehin zur
// ersten Fahrt ein.
export default function BestzeitStreifen({
  beste,
  eigeneSekunden,
}: {
  /** Schnellster Eintrag der Bestenliste (sortiert, dedupliziert), falls vorhanden. */
  beste: RouteTimeEntry | null;
  /** Die eigene bisherige Bestzeit; null für Gäste und ohne eigene Fahrt. */
  eigeneSekunden: number | null;
}) {
  if (!beste && eigeneSekunden === null) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-4 rounded-lg bg-surface px-4 py-3">
      {beste && (
        <Zeit
          beschriftung="Bestzeit"
          sekunden={beste.dauerSekunden}
          wer={beste.name}
        />
      )}
      {eigeneSekunden !== null && (
        <Zeit beschriftung="Deine Bestzeit" sekunden={eigeneSekunden} wer={null} />
      )}
    </dl>
  );
}

function Zeit({
  beschriftung,
  sekunden,
  wer,
}: {
  beschriftung: string;
  sekunden: number;
  wer: string | null;
}) {
  const { wert, einheit } = dauerTeile(sekunden);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <TimerIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {beschriftung}
      </dt>
      <dd className="text-title font-semibold tabular-nums tracking-tight">
        {wert}
        <span className="ml-1 text-sm font-medium tracking-normal text-muted">{einheit}</span>
      </dd>
      {wer && <dd className="truncate text-xs text-muted">{wer}</dd>}
    </div>
  );
}
