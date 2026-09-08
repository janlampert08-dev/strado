import Skeleton from "@/components/ui/Skeleton";
import { BottomNavSkeleton, HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Eigenes Skelett statt des Kaufseiten-Skeletts eine Ebene darüber: Next.js
// nimmt sonst app/profil/premium/loading.tsx, und das zeigt Vorteilsliste
// und Planauswahl — also die Seite, von der man gerade kommt, nicht die,
// auf die man geht. Diese Seite ist force-dynamic und fragt Stripe nach dem
// Preis, der Ladezustand ist also keine Millisekunde lang.
//
// Spiegelt app/profil/premium/zahlung/page.tsx: schmale Spalte (max-w-md),
// Premium-Pille mit Überschrift, dann die drei beschrifteten Abschnitte
// Auswahl, Pflichtangaben und Zahlungsdaten. Der Formularteil ist bewusst
// derselbe Aufbau wie CheckoutSkeleton in components/PremiumCheckoutForm.tsx
// — auf ihn läuft dieser Zustand direkt zu.

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 overflow-y-auto px-5 py-8 sm:px-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-9 w-64 rounded-md" />
        </div>

        <section className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32 rounded-sm" />
          <Skeleton className="h-20 rounded-lg" />
        </section>

        <section className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40 rounded-sm" />
          <Skeleton className="h-28 rounded-lg" />
        </section>

        <section className="flex flex-col gap-4">
          <Skeleton className="h-4 w-32 rounded-sm" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-28 rounded-sm" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
          <Skeleton className="h-11 w-full rounded-full" />
        </section>
      </main>
      <BottomNavSkeleton />
    </div>
  );
}
