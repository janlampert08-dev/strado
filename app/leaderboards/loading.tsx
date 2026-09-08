import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/leaderboards/page.tsx: Überschrift im text-display-Grad mit
// erklärendem Absatz, darunter die Ranglisten-Sections. Eine Rangliste ist
// eine Card mit getrennten Zeilen (divide-y), nicht acht einzelne Karten —
// das zeichnete diese Datei vorher, und beim Auflösen sprang die ganze
/**
 * Renders a loading skeleton for a leaderboard section.
 *
 * @returns A leaderboard section placeholder with a heading and eight rows.
 */

function LeaderboardSectionSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="h-4 w-32 rounded-sm" />
      <Card className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-3">
            <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
            <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1 rounded-sm" />
            <Skeleton className="h-4 w-16 shrink-0 rounded-sm" />
          </div>
        ))}
      </Card>
    </section>
  );
}

/**
 * Renders a loading skeleton for the leaderboards page.
 *
 * @returns The page loading layout with title, description, and leaderboard placeholders.
 */
export default function Loading() {
  return (
    <PageSkeleton maxWidth="max-w-2xl lg:max-w-5xl">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-9 w-56 rounded-md" />
        <Skeleton className="h-4 w-full rounded-sm" />
        <Skeleton className="h-4 w-3/4 rounded-sm" />
      </div>

      {/* Auf schmalen Viewports untereinander, ab sm zweispaltig, ab xl
          vierspaltig — wie die echten vier Ranglisten. Gezeichnet wird nur
          die erste: alles darunter liegt beim Laden ohnehin unter der
          Falz, und vier volle Listen wären mehr Flimmern als Information. */}
      <div className="flex flex-col gap-8 sm:grid sm:grid-cols-2 sm:items-start sm:gap-6 xl:grid-cols-4">
        <LeaderboardSectionSkeleton />
      </div>
    </PageSkeleton>
  );
}
