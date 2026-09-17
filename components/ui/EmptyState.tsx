import type { ComponentType, ReactNode } from "react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** Was hier stehen wird und wie es dazu kommt. Bei einer noch jungen
   *  Plattform ist leer der Normalfall, nicht die Ausnahme — dann sagt der
   *  Titel, was fehlt, und dieser Satz den nächsten Schritt. */
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-8 text-center">
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
