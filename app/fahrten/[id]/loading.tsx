import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/fahrten/[id]/page.tsx: Fahrer-Zeile mit Aktionen, Titelblock,
// Kartenkarte in ihrer echten Höhe (h-64 sm:h-80, siehe CompletionMap),
// Fotogalerie und das vierspaltige Kennzahlenraster. Die Karte war hier
// vorher als h-56 gezeichnet und die Kennzahlen dreispaltig — beides sprang
// beim Auflösen.

export default function Loading() {
  return (
    <PageSkeleton maxWidth="max-w-2xl lg:max-w-3xl">
      {/* Fahrer plus Datum links, Kudos/Teilen/Menü rechts */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Skeleton className="h-4 w-32 rounded-sm" />
          <Skeleton className="h-3 w-40 rounded-sm" />
        </div>
        <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
      </div>

      {/* Region, Titel, Start/Ziel */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-24 rounded-sm" />
        <Skeleton className="h-9 w-3/4 rounded-md" />
        <Skeleton className="h-4 w-48 rounded-sm" />
      </div>

      <Card className="h-64 overflow-hidden sm:h-80">
        <Skeleton className="h-full w-full" />
      </Card>

      {/* Fotos der Fahrt */}
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-24 shrink-0 rounded-lg" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-lg" />
        ))}
      </div>
    </PageSkeleton>
  );
}
