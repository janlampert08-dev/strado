import Skeleton from "@/components/ui/Skeleton";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/feed/page.tsx: Überschrift mit Unterzeile, die Profilsuche,
// der Alle/Folge-ich-Umschalter und die Fahrtenkarten. Die Profilsuche
// fehlte hier bisher ganz, und der Umschalter stand ohne Überschrift ganz
// oben — das Skelett begann also zwei Blöcke tiefer als die Seite.

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-4 w-64 rounded-sm" />
      </div>

      {/* Profilsuche */}
      <Skeleton className="h-10 rounded-lg" />

      {/* Umschalter samt Trennlinie darunter */}
      <div className="flex gap-2 border-b border-border pb-3">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </PageSkeleton>
  );
}
