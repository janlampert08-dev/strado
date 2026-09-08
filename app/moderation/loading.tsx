import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/moderation/page.tsx: Überschrift mit Zählzeile, darunter die
// Vorschlags- und Meldungskarten. Ohne diese Datei griff app/loading.tsx und
/**
 * Displays a loading skeleton for the moderation page.
 *
 * @returns The moderation page loading layout
 */

export default function Loading() {
  return (
    <PageSkeleton maxWidth="max-w-3xl">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-9 w-48 rounded-md" />
        <Skeleton className="h-4 w-64 rounded-sm" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Skeleton className="h-5 w-48 rounded-sm" />
              <Skeleton className="h-4 w-24 rounded-sm" />
            </div>
            <Skeleton className="h-4 w-full rounded-sm" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    </PageSkeleton>
  );
}
