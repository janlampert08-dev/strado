import { SparklesIcon } from "@/components/NavIcons";

// Die Premium-Pille über der Überschrift. Auf der Kaufseite
// (PremiumPurchaseView) und der Zahlungsseite dieselbe Marke: zwei Schritte
// desselben Kaufs, die beim Wechsel nicht wie zwei verschiedene Bereiche
// aussehen sollen.
export default function PremiumBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold tracking-wide text-accent uppercase">
      <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
      Premium
    </span>
  );
}
