import type { ComponentType, ElementType, HTMLAttributes, ReactNode } from "react";
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
  /**
   * Das Symbol links der Beschriftung.
   *
   * DIE REGEL, und sie ist der ganze Grund für diesen Parameter:
   *
   *   Eine Abschnittsmarke in "sm" TRÄGT EIN ICON. Immer.
   *   Eine Marke in "xs" (Formularfeld, Kachelbeschriftung) trägt keines.
   *   Ein Eyebrow (as="p" über einer Statusmeldung) trägt keines.
   *
   * Vorher entschied das jede Seite für sich, mit dem Ergebnis, dass die
   * Einstellungen neun Abschnitte mit Icon zeigten und das Profil daneben
   * vier ohne — bis auf "Fahrzeuge", das als einziges eines hatte. Zwei
   * Seiten, die dasselbe Muster unterschiedlich beantworten, kosten mehr
   * als jede der beiden Antworten für sich: man liest die eine Marke als
   * wichtiger, weil sie ein Zeichen trägt, und das ist nicht gemeint.
   *
   * Warum MIT statt ohne: die Abschnittsmarke steht in text-sm versal in
   * --color-muted, also bewusst leise. Beim Überfliegen einer langen Seite
   * auf dem Telefon ist ein Symbol der Anker, den eine leise Zeile Text
   * nicht hergibt — und Einstellungen wie Moderation sind genau solche
   * Seiten.
   *
   * Der Parameter ist technisch optional, weil TypeScript ihn nicht an
   * `groesse` koppeln kann, ohne die Komponente in Überladungen zu
   * zerlegen. Die Regel steht deshalb hier und nicht im Typ.
   */
  icon?: ComponentType<{ className?: string }>;
  children?: ReactNode;
}

// Die Abschnittsmarke: klein, halbfett, in der gedämpften Farbe — und seit
// dem Ruhe-Durchgang in Satzschreibung statt versal und gesperrt.
//
// Versal gesperrt ist die Marke einer Kategorie ("KENNZAHLEN") und stand
// auf derselben Seite neben aufklappbaren Abschnitten in Satzschreibung
// ("Auszeichnungen"): zwei Stimmen für dieselbe Rolle. Satzschreibung ist
// die ruhigere der beiden und die, die sich neben Fliesstext nicht vordrängt;
// die Hierarchie trägt jetzt Gewicht und Farbe allein, und das reicht.
//
// Vorher: klein, gesperrt, versal, in der gedämpften Farbe.
// Stand bisher als lokale Klassenkonstante nur in PremiumPurchaseView.tsx,
// während die Zahlungsseite ihre Abschnitte gar nicht beschriftet hat —
// beide Seiten gehören zum selben Kauf und müssen beim Überfliegen dieselben
// Stufen zeigen. Hier statt dort, damit die eine Stelle für beide gilt und
// die Seiten nicht auseinanderlaufen.
export default function SectionHeading({
  as: Component = "h2",
  groesse = "sm",
  icon: Icon,
  className,
  children,
  ...props
}: SectionHeadingProps) {
  return (
    <Component
      className={cn(
        "font-semibold text-muted",
        groesse === "xs" ? "text-xs" : "text-sm",
        // Nur wenn ein Icon da ist: sonst bekämen die Marken ohne eines
        // ein flex und damit eine andere Zeilenhöhe als vorher.
        Icon && "flex items-center gap-1.5",
        className,
      )}
      {...props}
    >
      {/* shrink-0, weil eine lange Beschriftung neben dem Icon sonst das
          Symbol staucht statt selbst umzubrechen — auf 390 px passiert das
          bei "Auf dieser Fahrt erkannt" oder "In Premium enthalten". */}
      {Icon && <Icon className={cn("shrink-0", groesse === "xs" ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" />}
      {children}
    </Component>
  );
}
