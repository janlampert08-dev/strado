import { SparklesIcon } from "@/components/NavIcons";

// Die Premium-Pille. Auf der Kaufseite (PremiumPurchaseView), der
// Zahlungsseite und der Abschluss-Seite (PremiumWillkommen) dieselbe Marke:
// drei Schritte desselben Kaufs, die beim Wechsel nicht wie drei
// verschiedene Bereiche aussehen sollen.
//
// Farbe ist --color-premium, nicht --color-accent. Dieselbe Regel wie beim
// Abzeichen hinter dem Namen (components/PremiumAbzeichen.tsx): Blau ist in
// dieser App die Farbe des Bedienbaren, und "Premium" ist überall dieselbe
// Sache — vom Kaufknopf bis zu dem Funkeln, das ein Abonnent danach im Feed
// hinter seinem Namen trägt. Zwei Farben für eine Sache hiessen, dass
// niemand das eine als Folge des anderen liest. Die Begründung und die
// Kontrastwerte stehen in app/globals.css.
//
// `label` gibt es, weil die Abschluss-Seite dieselbe Pille mit "Premium
// aktiv" beschriftet und sie bis hierher dafür Zeile für Zeile
// nachgebaut hat (Kernregel 14).
export default function PremiumBadge({ label = "Premium" }: { label?: string } = {}) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-premium-subtle px-3 py-1 text-xs font-semibold tracking-wide text-premium uppercase">
      <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
