import Skeleton from "@/components/ui/Skeleton";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/aktivitaet/page.tsx: Überschrift im text-display-Grad plus
// Unterzeile, darunter die Kudos-Liste.

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-9 w-48 rounded-md" />
        <Skeleton className="h-4 w-64 rounded-sm" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </PageSkeleton>
  );
}
