import Link from "next/link";
import { SparklesIcon } from "@/components/NavIcons";

// Der eine Hinweis, mit dem eine Premium-Funktion sich Konten ohne Abo zeigt.
//
// Drei Funktionen kommen mit dem Premium-Ausbau dazu (Wetterfenster,
// Pass-Sammlung mit Saisonrückblick, Wartungsheft), und jede braucht an
// ihrem Ort einen Satz, der sagt, was hier mit Premium stünde. Stünde dieser
// Satz dreimal gebaut da, gäbe es drei Tonlagen und drei Abstände — und
// genau das verbietet docs/premium-ausbau-plan.md Abschnitt 1 ("kein neues
// visuelles Muster").
//
// Bewusst leise: eine Zeile in text-muted, das Funkeln als einziges Zeichen,
// der Link unterstrichen statt als Knopf. Der gefüllte Akzent gehört den
// Handlungen des Nutzers (docs/design-vereinfachung.md, Anhang C2) — ein
// Verkauf in derselben Lautstärke wie "Strecke starten" wäre zu laut.
//
// Der Text sagt, was man bekäme, nicht dass etwas gesperrt ist. Ein
// Schloss-Symbol liest sich als Wegnahme; additives Gating
// (docs/premium-plan.md Abschnitt 4) nimmt nichts weg.
export default function PremiumHinweis({
  children,
  className = "",
}: {
  /** Ein Satz: was diese Stelle mit Premium zeigt. Ohne Punkt am Ende —
   *  der Link schliesst den Satz. */
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`flex items-start gap-2 text-sm text-muted ${className}`}>
      <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <span>
        {children}.{" "}
        <Link href="/profil/premium" className="text-foreground underline underline-offset-2">
          Premium ansehen
        </Link>
      </span>
    </p>
  );
}
