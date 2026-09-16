import Skeleton from "@/components/ui/Skeleton";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/aktivitaet/page.tsx: Überschrift im text-display-Grad plus
// Unterzeile, darunter die Reiterleiste, darunter die Aktivitätsliste.
//
// Die Reiterleiste kam dazu, als die Aktivität ein Reiter des Feeds wurde
// (components/FeedReiter.tsx) — rund 44 px, die ohne sie beim Auflösen
// nachspringen würden.

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-9 w-48 rounded-md" />
        <Skeleton className="h-4 w-64 rounded-sm" />
      </div>

      {/* Drei Segmente à min-h-9 in einer umrandeten Hülle mit p-1: diese
          Seite ist nur angemeldet erreichbar, also sind es immer drei. */}
      <div className="inline-flex w-fit items-center gap-1 rounded-full border border-border p-1">
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </PageSkeleton>
  );
}
