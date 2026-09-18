import type { ComponentType, ReactNode } from "react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  kompakt = false,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** Was hier stehen wird und wie es dazu kommt. Bei einer noch jungen
   *  Plattform ist leer der Normalfall, nicht die Ausnahme — dann sagt der
   *  Titel, was fehlt, und dieser Satz den nächsten Schritt. */
  description?: string;
  /* Handlungen in einem Leerzustand nehmen size "md" (44 px), nicht "sm":
     hier ist nie Gedränge, das den kleinen Knopf rechtfertigen würde, und
     Button.tsx setzt 44 px als Mass für eine App, die im Fahrzeug bedient
     wird. */
  action?: ReactNode;
  /** Für enge Flächen wie das Bottom-Sheet der Startseite. Dort bleiben
   *  eingeklappt (SHEET_PEEK_PX = 320 in ExploreView.tsx) unter Überschrift
   *  und Suchfeld rund 130 px — die volle Form braucht etwa 250, und die
   *  Knöpfe lagen unter der Kante, genau wenn man sie braucht. Kompakt steht
   *  das Icon neben dem Titel, und die Handlung kommt VOR dem Erklärsatz. */
  kompakt?: boolean;
}) {
  // Gefüllte Fläche statt gestricheltem Rahmen: die Strichellinie war die
  // dritte Randart der App neben Haarlinie und Kartenrahmen und las sich wie
  // ein Ablagefeld für einen Upload. Ein Leerzustand ist eine ruhige Stelle
  // mit einem nächsten Schritt, kein Platzhalter.
  if (kompakt) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg bg-surface px-4 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium [overflow-wrap:anywhere]">
          <Icon className="h-5 w-auto shrink-0 text-muted" aria-hidden="true" />
          {title}
        </p>
        {action}
        {description && <p className="text-sm text-pretty text-muted">{description}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-6 py-8 text-center">
      {/* w-auto statt w-7: die Lucide-Icons sind quadratisch, für sie ändert
          das nichts. Es lässt aber ein nicht quadratisches Zeichen durch,
          ohne es zu stauchen — das Signet (lib/marke.ts) ist rund 1.7-mal so
          breit wie hoch, und mit w-7 wäre es ein gequetschter Ring. */}
      <Icon className="h-7 w-auto text-muted" aria-hidden="true" />
      {description ? (
        // Mit Erklärsatz trägt der Titel die Aussage und steht deshalb in
        // Vordergrundfarbe; zwei gleich graue Zeilen hätten keine Rangfolge.
        // max-w hält den Satz auch in der breiten Spalte bei lesbarer Länge.
        <div className="flex max-w-[36ch] flex-col gap-1">
          <p className="text-sm font-medium text-balance">{title}</p>
          <p className="text-sm text-pretty text-muted">{description}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">{title}</p>
      )}
      {action}
    </div>
  );
}
