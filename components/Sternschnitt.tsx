import { SternIcon } from "@/components/NavIcons";
import { schnittText } from "@/lib/bewertungen";
import { cn } from "@/lib/utils/cn";

/**
 * Ein Sternenschnitt als ZAHL mit einem einzelnen Stern — "4.2 ★".
 *
 * ---------------------------------------------------------------------------
 * Warum keine Reihe aus fünf Sternen
 * ---------------------------------------------------------------------------
 * Bis hierher zeichnete `components/Sterne.tsx` den Schnitt als fünf anteilig
 * gefüllte Sterne und die Zahl stand daneben. Zwei Darstellungen desselben
 * Werts, nebeneinander — und die ungenauere zuerst. Wer "4.2" liest, hat die
 * Wertung; die Reihe davor sagt dasselbe noch einmal, nur schlechter: einen
 * Füllstand von 84 % schätzt niemand auf 4.2, und ob der vierte Stern zu drei
 * Vierteln oder zu vier Fünfteln gefüllt ist, unterscheidet auf einem Telefon
 * kein Auge.
 *
 * Der eine Stern bleibt, weil die Zahl allein nicht sagt, WOVON sie handelt.
 * "4.2" neben einer Strecke könnte eine Länge sein, eine Dauer, ein
 * Schwierigkeitsgrad. Er ist hier Einheitenzeichen, nicht Skala — dieselbe
 * Rolle, die "km" neben einer Distanz spielt.
 *
 * Für eine EINZELNE Wertung gilt das nicht: ein ganzzahliges "4 von 5" ist
 * genau das, was eine Reihe gut zeigt, und dort steht keine Zahl daneben, die
 * sie doppeln würde. `components/Sterne.tsx` bleibt deshalb bestehen und wird
 * in der Bewertungsliste weiter benutzt.
 *
 * ---------------------------------------------------------------------------
 * Farbe und Vorlesen
 * ---------------------------------------------------------------------------
 * --color-accent wie zuvor, aus demselben Grund: was warnt, muss überall
 * gleich warnen, und der Akzent ist in dieser App die Farbe für "hier steht
 * ein Wert". Die Begründung in voller Länge steht im Kopf von
 * `components/Sterne.tsx`.
 *
 * Der Stern ist aria-hidden; stattdessen trägt ein `sr-only` die Skala. Ohne
 * das läse ein Screenreader die nackte Zahl vor, und "4.2" allein ist die
 * Angabe ohne ihre Bezugsgrösse. Aufrufer setzen die Anzahl der Bewertungen
 * daneben, nicht hier — sie gehört zur Liste, nicht zum Schnitt.
 */
export default function Sternschnitt({
  schnitt,
  className,
  zahlClassName = "text-sm",
  sternClassName = "h-3.5 w-3.5",
  children,
}: {
  /** Arithmetisches Mittel zwischen 1 und 5, ungerundet. */
  schnitt: number;
  className?: string;
  /** Grösse und Ton der Zahl. Sie ist das Hauptelement, nicht der Stern. */
  zahlClassName?: string;
  /** Grösse des einen Sterns. */
  sternClassName?: string;
  /**
   * Was nach der Skala vorgelesen werden soll — in der Explore-Liste die
   * Anzahl der Bewertungen. Steht hier statt daneben, damit "4.2, von 5
   * Sternen, 7 Bewertungen" eine Ansage bleibt und nicht in zwei zerfällt.
   */
  children?: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <span className={cn("tabular-nums", zahlClassName)}>
        {schnittText(schnitt)}
      </span>
      <SternIcon
        className={cn("shrink-0 fill-current text-accent", sternClassName)}
        aria-hidden="true"
      />
      <span className="sr-only">von 5 Sternen</span>
      {children}
    </span>
  );
}
