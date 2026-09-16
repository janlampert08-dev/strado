import { cn } from "@/lib/utils/cn";

// Die eine segmentierte Wahl. Vorher gab es fünf Fassungen desselben
// Bedienelements: Privat/Öffentlich in RideSummaryForm und in
// NeueStreckeForm, Ja/Nein für die Rundfahrt, der Hell/Dunkel-Schalter und
// die Feed-Reiter — rounded-lg gegen rounded-full, py-1.5 gegen py-2,
// jeweils leicht andere Farben für "gewählt".
//
// Die Hülle trägt den Rahmen, die Segmente tragen nur ihre Füllung. Das ist
// der Unterschied zu einer Reihe einzelner Chips: man sieht auf einen Blick,
// dass die Optionen zusammengehören und sich gegenseitig ausschliessen.
//
// 36 px Segmenthöhe plus 2 × 4 px Innenabstand ergeben 44 px Gesamthöhe —
// die Daumengrenze aus components/ui/Button.tsx.
export function segmentHuelleClassName(className?: string): string {
  return cn(
    "inline-flex items-center gap-1 rounded-full border border-border p-1",
    className,
  );
}

export function segmentClassName(aktiv: boolean, className?: string): string {
  return cn(
    "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4",
    "text-sm font-medium whitespace-nowrap transition-colors duration-fast",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    aktiv
      ? "bg-foreground text-background"
      : "text-muted hover:text-foreground disabled:hover:text-muted",
    className,
  );
}

export interface Segment<T extends string> {
  wert: T;
  label: React.ReactNode;
  /** Gesperrt, mit Begründung im title — z. B. eine zu geringe Abdeckung. */
  gesperrt?: boolean;
  hinweis?: string;
}

/** Die Variante mit eigenem State — für Formulare (Sichtbarkeit, Rundfahrt). */
export default function SegmentedControl<T extends string>({
  label,
  segmente,
  wert,
  onChange,
  className,
}: {
  /** Für Hilfstechnik: was hier überhaupt gewählt wird. */
  label: string;
  segmente: Segment<T>[];
  wert: T;
  onChange: (wert: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={segmentHuelleClassName(className)}>
      {segmente.map((s) => (
        <button
          key={s.wert}
          type="button"
          aria-pressed={s.wert === wert}
          disabled={s.gesperrt}
          title={s.gesperrt ? s.hinweis : undefined}
          onClick={() => onChange(s.wert)}
          className={segmentClassName(s.wert === wert, s.gesperrt ? "opacity-40" : undefined)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
