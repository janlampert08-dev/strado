import { extendTailwindMerge } from "tailwind-merge";

type ClassValue = string | false | null | undefined;

// Klassen-Zusammensetzung für components/ui/* und alle, die ihnen Klassen
// mitgeben. Seit 2026-09-23 mit tailwind-merge statt eines String-Joins.
//
// WARUM: Beim String-Join hoben sich zwei Utilities derselben
// CSS-Eigenschaft nicht auf, beide landeten im class-Attribut, und welche
// gewann, entschied die Reihenfolge im erzeugten Stylesheet — nicht die im
// Attribut. Eine angehängte Klasse überschrieb eine eingebaute also NICHT
// verlässlich. Das ist mehrfach teuer geworden: das runde Suchfeld in
// ExploreSidebar blieb ein abgerundetes Rechteck (fieldClassName bringt
// rounded-lg mit, im Stylesheet stand es hinter rounded-full), und die
// Ausweichregel "wer eine Vorgabe ändern muss, bekommt einen Parameter"
// liess die Primitiven Parameter um Parameter wachsen (chipClassName(gross),
// SectionHeading groesse, textAktionClassName groesse, Seitenrahmen …).
// Jetzt gilt: die spätere Klasse gewinnt, cn("min-h-9", "min-h-11") ist
// "min-h-11".
//
// DIE KONFIGURATION IST NICHT OPTIONAL. tailwind-merge kennt nur die
// Standard-Skala von Tailwind. Ein Name, den es nicht kennt, landet in der
// nächstbesten Gruppe — und das ist ausgerechnet für unsere eigenen Tokens
// falsch:
//   - text-display / text-title (app/globals.css, --text-*) hielte es für
//     Textfarben. cn("text-display", "text-muted") warf dann die Grösse weg
//     und liess nur die Farbe stehen. Deshalb theme.text.
//   - shadow-elevated / shadow-overlay hielte es für Schattenfarben; eine
//     spätere shadow-accent/20 hätte den Schatten selbst gelöscht.
//   - ease-standard und duration-fast/-base kennt es gar nicht, zwei davon
//     hintereinander blieben beide stehen.
// Farben (bg-surface, text-muted, border-border-control …) brauchen keinen
// Eintrag: tailwind-merge nimmt jeden unbekannten Farbnamen als Farbe an.
// Wer in app/globals.css ein --text-*, --shadow-*, --ease-* oder
// --duration-* ergänzt, trägt es hier nach; lib/utils/cn.test.ts prüft die
// heutigen.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "title"],
      shadow: ["elevated", "overlay"],
      ease: ["standard"],
    },
    classGroups: {
      duration: [{ duration: ["fast", "base"] }],
    },
  },
});

export function cn(...values: ClassValue[]): string {
  return twMerge(...values);
}
