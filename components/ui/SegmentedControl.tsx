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
// ZUR GRÖSSE, weil der Kommentar hier zuerst mehr versprach, als das
// Bedienelement hält: die Hülle ist mit 36 px Segment plus 2 × 4 px
// Innenabstand 44 px hoch — die TIPPFLÄCHE ist aber das Segment, und das
// sind 36 px. Die 8 px gehören der Hülle und lösen keine Auswahl aus.
//
// 36 px liegt über den 24 px aus WCAG 2.2 SC 2.5.8 und über den ~32 px,
// die die fünf abgelösten Fassungen hatten, aber unter den 44 px, die
// components/ui/IconButton.tsx als Mindestwert der App festschreibt. Das
// ist hier vertretbar: keine dieser Leisten wird während der Fahrt bedient
// (Farbschema in den Einstellungen, Feed-Reiter, Sichtbarkeit im Fazit am
// Strassenrand), und auf 44 px hochgezogen wäre die Hülle 52 px hoch und
// damit höher als jede Schaltfläche daneben. Wer es doch braucht, bekommt
// einen Parameter — nicht ein angehängtes min-h-11, das lib/utils/cn.ts
// nicht verlässlich durchsetzt.
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
    // ring-offset stand am abgelösten ThemeToggle und ging beim
    // Zusammenlegen verloren — ohne ihn liegt der Ring direkt auf der Kante
    // des Segments und ist gegen die Füllung kaum auszumachen.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
  // radiogroup/radio statt group/aria-pressed: hier wird EINE aus mehreren
  // Optionen gewählt, nicht ein Zustand gedrückt. aria-pressed sagt einer
  // Hilfstechnik nur "dieser Knopf ist gedrückt" und lässt offen, dass die
  // anderen sich dadurch ausschliessen — die Rolle radio sagt beides, samt
  // Position ("2 von 3"). ThemeToggle hatte das von Anfang an richtig; beim
  // Zusammenlegen der fünf Fassungen ist die schwächere Semantik hier
  // gelandet, ausgerechnet unter dem Sichtbarkeits-Umschalter im Fazit —
  // der folgenreichsten Wahl der App.
  return (
    <div role="radiogroup" aria-label={label} className={segmentHuelleClassName(className)}>
      {segmente.map((s) => (
        <button
          key={s.wert}
          type="button"
          role="radio"
          aria-checked={s.wert === wert}
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
