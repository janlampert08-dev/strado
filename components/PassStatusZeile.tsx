import { cn } from "@/lib/utils/cn";
import type { PassStatusAnzeige, StatusTon } from "@/lib/passStatus";

// Die Statuszeile eines Passes. Drei Stellen zeigen sie — Streckenseite,
// Passliste, Moderation — und sie sollen nicht dreimal verschieden aussehen.
//
// Kein eigener Farbwert: die drei Töne zeigen auf die Statustokens aus
// app/globals.css, die im Dunkelmodus eigene, AA-geprüfte Werte haben.

const TON_TEXT: Record<StatusTon, string> = {
  gut: "text-success",
  warnung: "text-warning",
  schlecht: "text-danger",
  still: "text-muted",
};

const TON_FLAECHE: Record<StatusTon, string> = {
  gut: "bg-success",
  warnung: "bg-warning",
  schlecht: "bg-danger",
  still: "bg-muted",
};

/**
 * Der Punkt vor der Beschriftung.
 *
 * Er ist Beiwerk, nicht Information: die Farbe wiederholt nur, was daneben
 * als Wort steht. Deshalb aria-hidden — eine Vorlesesoftware liest den
 * Zustand im Text, nicht als "grüner Kreis".
 */
export function StatusPunkt({ ton, className }: { ton: StatusTon; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", TON_FLAECHE[ton], className)}
    />
  );
}

/** Kompakte Form für Listen: Punkt und Wort, sonst nichts. */
export function PassStatusMarke({
  anzeige,
  className,
}: {
  anzeige: PassStatusAnzeige;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", TON_TEXT[anzeige.ton], className)}>
      <StatusPunkt ton={anzeige.ton} />
      {anzeige.label}
    </span>
  );
}

/** Die ausführliche Zeile: Zustand, Meldung, Herkunft und Alter. */
export default function PassStatusZeile({ anzeige }: { anzeige: PassStatusAnzeige }) {
  return (
    <div className="flex flex-col gap-1">
      <p className={cn("flex items-center gap-2 text-sm font-medium", TON_TEXT[anzeige.ton])}>
        <StatusPunkt ton={anzeige.ton} />
        {anzeige.label}
      </p>
      <p className="text-sm text-muted">{anzeige.text}</p>
      {/* Die Herkunft steht fest dabei, auch wenn sie klein ist: ein Status,
          der nicht sagt, woher er kommt und wie alt er ist, wird geglaubt
          oder verworfen — beides ohne Grundlage. */}
      <p className="text-xs text-muted">{anzeige.herkunft}</p>
    </div>
  );
}
