import Skeleton from "@/components/ui/Skeleton";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/feed/page.tsx: Überschrift mit Unterzeile, die Profilsuche,
// die Reiterleiste und die Fahrtenkarten. Die Profilsuche
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

      {/* Die Reiterleiste (components/FeedReiter.tsx): eine umrandete Hülle
          mit p-1, drei Segmente à min-h-9, keine Trennlinie darunter.
          Gezeichnet werden drei — angemeldet sind es drei ("Alle",
          "Folge ich", "Aktivität"), und angemeldet ist der Fall, in dem
          dieses Skelett fast immer erscheint.

          Vorher standen hier zwei Pillen mit border-b: der Umschalter, den
          es vor der Umstellung gab. */}
      <div className="inline-flex w-fit items-center gap-1 rounded-full border border-border p-1">
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </PageSkeleton>
  );
}
