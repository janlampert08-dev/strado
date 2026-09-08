import Skeleton from "@/components/ui/Skeleton";
import { HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Eigenes Skelett, weil Next.js sonst das der Kaufseite eine Ebene darüber
// nimmt (app/profil/premium/loading.tsx) — das zeigt Vorteilsliste und
// Planauswahl, also ausgerechnet die Seite, die man gerade hinter sich hat.
// Spiegelt stattdessen den Aufbau von components/PremiumWillkommen.tsx:
// rundes Abzeichen, Überschrift, Vorteilskarte, zwei Schaltflächen.
//
// Ohne BottomNav: die Abschluss-Seite rendert sie auch nicht.
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 overflow-y-auto px-5 py-8 sm:px-6">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex w-full flex-col items-center gap-3">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-4 w-4/5 rounded-sm" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
        <div className="flex w-full flex-col gap-2">
          <Skeleton className="h-11 w-full rounded-full" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </main>
    </div>
  );
}
