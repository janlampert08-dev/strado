import { SparklesIcon } from "@/components/NavIcons";

// Die Premium-Pille. Auf der Kaufseite (PremiumPurchaseView), der
// Zahlungsseite und der Abschluss-Seite (PremiumWillkommen) dieselbe Marke:
// drei Schritte desselben Kaufs, die beim Wechsel nicht wie drei
// verschiedene Bereiche aussehen sollen.
//
// `label` gibt es, weil die Abschluss-Seite dieselbe Pille mit "Premium
// aktiv" beschriftet und sie bis hierher dafür Zeile für Zeile nachgebaut
// hat (Kernregel 14).
export default function PremiumBadge({ label = "Premium" }: { label?: string } = {}) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold tracking-wide text-accent uppercase">
      <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
