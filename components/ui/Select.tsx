// "use client" nicht wegen eigener Interaktivität, sondern wegen
// fieldClassName: Input.tsx ist ein Client-Modul, und lib/reactGrenze.test.ts
// hält fest, dass eine Server-Datei daraus keinen Wert importieren darf.
"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { fieldClassName } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

/**
 * Das Auswahlfeld der App — ein natives <select> mit eigenem Pfeil.
 *
 * Vorher trug jedes Auswahlfeld nur fieldClassName() und liess sein
 * Bedienelement vom Betriebssystem zeichnen. Auf Windows ist das ein
 * graues Kästchen mit hartem Dreieck, auf macOS ein blaues Doppelpfeil-
 * Feld — in einer Zeile mit den eigenen Eingabefeldern und Knöpfen sah an
 * sieben Stellen genau ein Element nach fremder Software aus. Auf dem
 * Telefon fiel es am wenigsten auf und auf dem Schreibtisch am meisten.
 *
 * Nur die Anzeige ist ausgetauscht, nicht das Bauteil: die Liste öffnet
 * weiterhin das System (unter iOS also das Rad am unteren Rand), Tastatur,
 * Screenreader und Formular-Wiederherstellung (useEingabenBewahren)
 * verhalten sich unverändert. `appearance-none` nimmt nur den Pfeil weg,
 * den der Chevron daneben ersetzt.
 *
 * `huelleClassName` ist für Breiten und Abstände da, die am Rahmen hängen
 * müssen statt am Feld: der Chevron sitzt an der Hülle, also würde ein
 * `sm:max-w-[60%]` am <select> die beiden auseinanderlaufen lassen.
 */
export default function Select({
  className,
  huelleClassName,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  huelleClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative", huelleClassName)}>
      <select className={fieldClassName(cn("appearance-none pr-10", className))} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  );
}
