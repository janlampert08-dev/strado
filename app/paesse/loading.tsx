import Skeleton from "@/components/ui/Skeleton";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/paesse/page.tsx: Überschrift mit Unterzeile, die Sammlungszeile,
// die Filterleiste und die Liste. Die Zeilenzahl ist die des Katalogs — bei
// weniger Platzhaltern als echten Zeilen springt die Seite beim Auflösen.
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-4 w-80 max-w-full rounded-sm" />
      </div>

      <Skeleton className="h-5 w-48 rounded-sm" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full rounded-full" />
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>

      <div className="flex flex-col gap-px rounded-lg border border-border p-4">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1">
              <Skeleton className="h-4 w-40 max-w-full rounded-sm" />
              <Skeleton className="h-3 w-32 max-w-full rounded-sm" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0 rounded-sm" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
