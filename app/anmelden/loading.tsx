import Skeleton from "@/components/ui/Skeleton";
import { HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Spiegelt app/anmelden/page.tsx: Kopfleiste, ein schmales, senkrecht
// zentriertes Formular (max-w-sm) und die Rechtstext-Zeile ganz unten.
// Bewusst knapp gehalten — die Seite besteht aus drei Feldern, ein
// detaillierteres Skelett hätte hier nichts zu zeigen. Keine BottomNav:
// app/anmelden/page.tsx rendert <Header back="/" />, das die Leiste zwar
// mitbringt, aber auf dieser Vollbild-Formularseite tritt sie hinter dem
// zentrierten Formular nicht in Erscheinung — sie wird trotzdem
// gezeichnet, damit unten nichts nachrutscht.

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <Skeleton className="h-9 w-40 rounded-md" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
        <Skeleton className="h-4 w-56 rounded-sm" />
      </main>
      <div className="flex justify-center pb-6">
        <Skeleton className="h-3 w-40 rounded-sm" />
      </div>
    </div>
  );
}
