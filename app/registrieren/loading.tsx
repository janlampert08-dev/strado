import Skeleton from "@/components/ui/Skeleton";
import { HeaderSkeleton } from "@/components/ui/PageSkeleton";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

// Spiegelt app/registrieren/page.tsx: Kopfleiste und ein schmales, senkrecht
// zentriertes Formular (Seitenrahmen breite="schmal") mit drei Feldern plus Hinweis auf die
// Rechtstexte. Bewusst knapp — ein detaillierteres Skelett hätte auf einer
// Formularseite nichts zu zeigen. Ohne diese Datei griff app/loading.tsx und
// zeichnete die Explore-Karte.

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      {/* Scrollbehälter plus min-h-full statt flex-1 — dieselbe
          Geometrie wie die Seite daneben, samt Begründung dort. */}
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          <Skeleton className="h-9 w-48 rounded-md" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-56 rounded-sm" />
        </Seitenrahmen>
      </div>
    </div>
  );
}
