import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

interface SectionHeadingProps extends HTMLAttributes<HTMLElement> {
  /** Anderes Element als <h2> rendern — etwa "legend" in einem <fieldset>. */
  as?: ElementType;
  /**
   * Nur zusammen mit as="label" sinnvoll. Steht hier, weil
   * HTMLAttributes<HTMLElement> es nicht kennt — und ein Label ohne
   * Zuordnung wäre schlechter als die handgeschriebene Klassenkette, die
   * diese Komponente ersetzt.
   */
  htmlFor?: string;
  /**
   * "sm" (Vorgabe) für Seitenabschnitte, "xs" für die Marken INNERHALB
   * eines Formulars.
   *
   * Der Grund für die zweite Stufe: sechs Stellen schrieben dieselbe
   * Klassenkette von Hand hin, aber in text-xs — drei davon im Fazit, das
   * PR #254 selbst neu baut. Das war nicht bloss "noch nicht migriert",
   * sondern eine andere Grösse für dieselbe Rolle, und der Zwischenstand
   * aus beidem war der teuerste. Sie alle auf text-sm zu heben wäre eine
   * sichtbare Änderung an Formularen, um die niemand gebeten hat; also
   * bekommt die Marke eine Grösse statt die Formulare eine neue Optik.
   */
  groesse?: "sm" | "xs";
}

// Die Abschnittsmarke des Premium-Flusses: klein, gesperrt, versal, in der
// gedämpften Farbe. Stand bisher als lokale Klassenkonstante nur in
// PremiumPurchaseView.tsx, während die Zahlungsseite ihre Abschnitte gar
// nicht beschriftet hat — beide Seiten gehören zum selben Kauf und müssen
// beim Überfliegen dieselben Stufen zeigen. Hier statt dort, damit die eine
// Stelle für beide gilt und die Seiten nicht auseinanderlaufen.
export default function SectionHeading({
  as: Component = "h2",
  groesse = "sm",
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <Component
      className={cn(
        "font-semibold tracking-wide text-muted uppercase",
        groesse === "xs" ? "text-xs" : "text-sm",
        className,
      )}
      {...props}
    />
  );
}
