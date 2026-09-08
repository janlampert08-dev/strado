import Skeleton from "@/components/ui/Skeleton";
import { HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Wie bei der Abschluss-Seite: ohne eigenes loading.tsx zeigt Next.js hier
// das der Kaufseite eine Ebene darüber, also Vorteilsliste und Planauswahl —
// die Seite, von der man gerade kommt. Das liest sich wie ein Rücksprung.
//
// Spiegelt stattdessen app/profil/premium/zahlung/page.tsx: Überschrift mit
// Plan-Zeile, die Karte mit den Pflichtangaben, dann das Bezahlformular in
// derselben Form wie CheckoutSkeleton in components/PremiumCheckoutForm.tsx.
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-5 py-8 sm:px-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-56 rounded-md" />
          <Skeleton className="h-4 w-44 rounded-sm" />
        </div>
        <Skeleton className="h-28 w-full rounded-lg" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </main>
    </div>
  );
}
