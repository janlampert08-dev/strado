import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Der eine Seitenrahmen. Vorher schrieb jede Seite ihr <main> selbst, und
// dabei waren zwölf verschiedene Fassungen für 26 Seiten entstanden.
// Sichtbar ist davon auf dem Telefon fast nur der Seitenabstand — und der
// war px-6 (24 px) auf acht Seiten und px-5 (20 px) auf zwölf. Vier Pixel
// Unterschied im Rand, je nachdem wo man ist: einzeln unsichtbar, in der
// Summe genau das Gefühl, dass die App nicht ganz sitzt.
//
// Ab sm laufen ohnehin beide auf 24 px zusammen — der Unterschied betraf
// also ausgerechnet nur das Telefon.
//
// Die Kartenseiten (Startseite, Streckenseite, strecken/neu) benutzen das
// hier NICHT: sie haben eine eigene, bewusste Geometrie aus Karte plus
// DragSheet und kein zentriertes Textmass.
const breiten = {
  /** Formulare, Anmeldung — eine Spalte, die nicht auseinanderläuft. */
  schmal: "max-w-md",
  /** Alles Übrige. */
  normal: "max-w-2xl lg:max-w-3xl",
  /** Bestenlisten: vier Listen nebeneinander brauchen mehr. */
  weit: "max-w-2xl lg:max-w-5xl",
} as const;

export type Seitenbreite = keyof typeof breiten;

export default function Seitenrahmen({
  breite = "normal",
  className,
  children,
}: {
  breite?: Seitenbreite;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10",
        breiten[breite],
        className,
      )}
    >
      {children}
    </main>
  );
}
