type ClassValue = string | false | null | undefined;

// Kleiner Ersatz für clsx/classnames, um keine neue Abhängigkeit für einen
// simplen String-Join einzuführen — reicht für die Varianten-Zusammensetzung
// in components/ui/*.
//
// WAS DAS HIER NICHT IST: tailwind-merge. Zwei Utilities derselben
// CSS-Eigenschaft heben sich nicht auf, sie landen beide im class-Attribut,
// und welche gewinnt, entscheidet die Reihenfolge im erzeugten Stylesheet —
// nicht die im Attribut. Eine angehängte Klasse überschreibt eine
// eingebaute also NICHT verlässlich.
//
// Das ist einmal teuer geworden: ExploreSidebar rief
// fieldClassName("rounded-full"), fieldClassName bringt rounded-lg mit, und
// im Stylesheet steht rounded-lg hinter rounded-full — das runde Suchfeld
// blieb ein abgerundetes Rechteck neben dem kreisrunden Standort-Knopf.
//
// Die Regel daraus: Wer eine eingebaute Vorgabe ändern muss, bekommt einen
// Parameter (chipClassName(gross), SectionHeading groesse), statt eine
// zweite Klasse anzuhängen und auf die Sortierung zu hoffen.
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
