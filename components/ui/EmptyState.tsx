import type { ComponentType, ReactNode } from "react";

export default function EmptyState({
  icon: Icon,
  title,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  action?: ReactNode;
}) {
  // Gefüllte Fläche statt gestricheltem Rahmen: die Strichellinie war die
  // dritte Randart der App neben Haarlinie und Kartenrahmen und las sich wie
  // ein Ablagefeld für einen Upload. Ein Leerzustand ist eine ruhige Stelle
  // mit einem nächsten Schritt, kein Platzhalter.
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-6 py-8 text-center">
      {/* w-auto statt w-7: die Lucide-Icons sind quadratisch, für sie ändert
          das nichts. Es lässt aber ein nicht quadratisches Zeichen durch,
          ohne es zu stauchen — das Signet (lib/marke.ts) ist rund 1.7-mal so
          breit wie hoch, und mit w-7 wäre es ein gequetschter Ring. */}
      <Icon className="h-7 w-auto text-muted" aria-hidden="true" />
      <p className="text-sm text-muted">{title}</p>
      {action}
    </div>
  );
}
