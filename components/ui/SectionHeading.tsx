import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

interface SectionHeadingProps extends HTMLAttributes<HTMLElement> {
  /** Anderes Element als <h2> rendern — etwa "legend" in einem <fieldset>. */
  as?: ElementType;
}

// Die Abschnittsmarke des Premium-Flusses: klein, gesperrt, versal, in der
// gedämpften Farbe. Stand bisher als lokale Klassenkonstante nur in
// PremiumPurchaseView.tsx, während die Zahlungsseite ihre Abschnitte gar
// nicht beschriftet hat — beide Seiten gehören zum selben Kauf und müssen
// beim Überfliegen dieselben Stufen zeigen. Hier statt dort, damit die eine
// Stelle für beide gilt und die Seiten nicht auseinanderlaufen.
export default function SectionHeading({
  as: Component = "h2",
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <Component
      className={cn("text-sm font-semibold tracking-wide text-muted uppercase", className)}
      {...props}
    />
  );
}
