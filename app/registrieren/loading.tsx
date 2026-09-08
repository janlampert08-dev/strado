import Skeleton from "@/components/ui/Skeleton";
import { HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Spiegelt app/registrieren/page.tsx: Kopfleiste und ein schmales, senkrecht
// zentriertes Formular (max-w-sm) mit drei Feldern plus Hinweis auf die
// Rechtstexte. Bewusst knapp — ein detaillierteres Skelett hätte auf einer
// Formularseite nichts zu zeigen. Ohne diese Datei griff app/loading.tsx und
// zeichnete die Explore-Karte.

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <Skeleton className="h-9 w-48 rounded-md" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
        <Skeleton className="h-4 w-56 rounded-sm" />
      </main>
    </div>
  );
}
