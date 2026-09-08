import Skeleton from "@/components/ui/Skeleton";
import { BottomNavSkeleton, HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Eigenes Skelett statt des Profil-Skeletts eine Ebene darüber (Next.js
// nimmt das nächstgelegene loading.tsx). Spiegelt app/profil/premium/page.tsx
// und components/PremiumPurchaseView.tsx: schmale Spalte (max-w-lg), oben
// die Premium-Pille mit Überschrift, dann die Vorteilsliste und die
// Planauswahl. Nicht über PageSkeleton, weil hier <main> selbst der
/**
 * Renders the premium profile page loading skeleton.
 *
 * @returns The loading layout for the premium profile page.
 */

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 overflow-y-auto px-5 py-8 sm:px-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-4 w-full rounded-sm" />
          <Skeleton className="h-4 w-4/5 rounded-sm" />
        </div>

        <section className="flex flex-col gap-3">
          <Skeleton className="h-4 w-48 rounded-sm" />
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-3/4 rounded-sm" />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <Skeleton className="mb-1 h-4 w-28 rounded-sm" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </section>
      </main>
      <BottomNavSkeleton />
    </div>
  );
}
