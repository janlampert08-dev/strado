import { cn } from "@/lib/utils/cn";

// Eine Zahl mit ihrer Beschriftung. Vorher stand dasselbe Muster fünfzehnmal
// von Hand in app/ — sieben auf der Streckenseite, vier auf der Fahrtseite,
// vier im Profil — und zwar mit uneinheitlicher Betonung: die jeweils ersten
// beiden Kacheln text-title/600, der Rest einmal font-mono, einmal text-lg.
// Gleiche Rolle, drei Grössen, kein Grund.
//
// Deshalb gibt es hier genau EINE Betonungsstufe. Wer eine Kachel
// hervorheben will, tut das über ihre Position im Raster, nicht über ihre
// Schriftgrösse.
//
// Die zweite Regel steht nicht im Code, sondern in docs/design-vereinfachung.md
// (Anhang A2): höchstens vier Kacheln je Raster. Was darüber hinausgeht,
// wird eine Zeile darunter — siehe Kennzahlenzeile weiter unten.
export default function Kennzahl({
  beschriftung,
  wert,
  zusatz,
  className,
}: {
  beschriftung: React.ReactNode;
  wert: React.ReactNode;
  /** Zweite, kleinere Zeile unter dem Wert (z. B. "12:04 in Bewegung"). */
  zusatz?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-1 rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <dt className="flex items-center gap-1.5 text-sm text-muted">{beschriftung}</dt>
      <dd className="text-title font-mono font-semibold tabular-nums">{wert}</dd>
      {zusatz !== undefined && zusatz !== null && (
        <dd className="font-mono text-xs tabular-nums text-muted">{zusatz}</dd>
      )}
    </div>
  );
}

// Das Raster darum — höchstens vier Kacheln, damit auf dem Telefon nicht
// vier Zeilen Kästen entstehen, bevor der eigentliche Inhalt beginnt.
export function Kennzahlen({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>{children}</dl>
  );
}

// Der Rest, der nicht als Kachel taugt: eine Zeile aus Wertpaaren, mit
// Mittelpunkt getrennt. Auf der Streckenseite ersetzt das drei Kacheln
// (rund 160 px) durch eine Zeile (rund 24 px).
export function Kennzahlenzeile({
  eintraege,
  className,
}: {
  eintraege: { beschriftung: string; wert: string }[];
  className?: string;
}) {
  const sichtbar = eintraege.filter((e) => e.wert.trim() !== "" && e.wert !== "—");
  if (sichtbar.length === 0) return null;

  return (
    <p className={cn("text-sm leading-relaxed text-muted", className)}>
      {sichtbar.map((e, i) => (
        <span key={e.beschriftung}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {e.beschriftung} <span className="font-mono tabular-nums text-foreground">{e.wert}</span>
        </span>
      ))}
    </p>
  );
}
