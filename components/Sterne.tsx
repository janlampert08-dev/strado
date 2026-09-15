import { SternIcon } from "@/components/NavIcons";
import { cn } from "@/lib/utils/cn";

const SKALA = [0, 1, 2, 3, 4];

/**
 * Ein Sternenschnitt als Bild — fünf Sterne, anteilig gefüllt.
 *
 * ---------------------------------------------------------------------------
 * Warum anteilig und nicht gerundet
 * ---------------------------------------------------------------------------
 * Vier gefüllte Sterne für 4.4 und für 3.6 wären dieselbe Zeichnung für zwei
 * merklich verschiedene Strecken. Gezeichnet wird deshalb eine Reihe leerer
 * Sterne und darüber dieselbe Reihe gefüllt, auf `wert / 5` breit
 * beschnitten. Das trifft auch halbe Sterne, ohne ein zweites Symbol zu
 * brauchen.
 *
 * Das `overflow-hidden` schneidet die obere Reihe; `shrink-0` an deren
 * Sternen ist dabei nicht Kosmetik, sondern Bedingung: ohne das würde der
 * Flex-Container seine fünf Kinder in die beschnittene Breite quetschen,
 * statt sie abzuschneiden — aus 40 % Breite würden fünf schmale Sterne
 * statt zweier ganzer.
 *
 * ---------------------------------------------------------------------------
 * Farbe
 * ---------------------------------------------------------------------------
 * --color-accent, nicht --color-warning. Der Gelbton läge bei Sternen nahe,
 * aber was warnt, muss überall gleich warnen — eine Bewertung, die in
 * derselben Farbe steht wie ein Hinweis auf ein Problem, wird einmal falsch
 * gelesen und danach ignoriert. Der Akzent ist in dieser App die eine Farbe
 * für "hier steht ein Wert"; dieselbe Wahl wie bei MotorklasseBadge.
 *
 * ---------------------------------------------------------------------------
 * Vorlesen
 * ---------------------------------------------------------------------------
 * Die Sterne selbst sind aria-hidden. Sie tragen die Information nicht
 * allein: jeder Aufrufer setzt die Zahl daneben, und "4.2, 7 Bewertungen"
 * ist vorgelesen brauchbarer als fünf Symbolnamen. Wer sie ohne Zahl setzt,
 * gibt ein aria-label mit.
 */
export default function Sterne({
  wert,
  className,
  sterneClassName = "h-3.5 w-3.5",
}: {
  /** Schnitt zwischen 0 und 5. Werte ausserhalb werden beschnitten. */
  wert: number;
  className?: string;
  /** Grösse eines einzelnen Sterns. Beide Reihen bekommen sie. */
  sterneClassName?: string;
}) {
  const anteil = Math.max(0, Math.min(1, wert / SKALA.length)) * 100;

  return (
    <span className={cn("relative inline-flex shrink-0", className)} aria-hidden="true">
      <span className="flex">
        {SKALA.map((i) => (
          <SternIcon key={i} className={cn("shrink-0 text-border-strong", sterneClassName)} />
        ))}
      </span>
      <span
        className="absolute inset-y-0 left-0 flex overflow-hidden"
        style={{ width: `${anteil}%` }}
      >
        {SKALA.map((i) => (
          <SternIcon
            key={i}
            className={cn("shrink-0 fill-current text-accent", sterneClassName)}
          />
        ))}
      </span>
    </span>
  );
}
