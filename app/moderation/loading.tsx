import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/moderation/page.tsx: Überschrift mit Zählzeile und
// Creator-Links-Schaltfläche, darunter die drei Sprungmarken, dann ein
// Abschnitt aus Abschnittsmarke und Karten. Ohne diese Datei griff
// app/loading.tsx und zeichnete die Explore-Karte.

export default function Loading() {
  return (
    <PageSkeleton maxWidth="max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-9 w-48 rounded-md" />
          <Skeleton className="h-4 w-40 rounded-sm" />
        </div>
        <Skeleton className="h-9 w-36 shrink-0 rounded-lg" />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.25rem] rounded-lg" />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40 rounded-sm" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Skeleton className="h-5 w-48 rounded-sm" />
              <Skeleton className="h-4 w-20 rounded-sm" />
            </div>
            <Skeleton className="h-4 w-full rounded-sm" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    </PageSkeleton>
  );
}
