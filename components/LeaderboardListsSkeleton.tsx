import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";

// Platzhalter für die vier globalen Ranglisten.
//
// Eine Datei, zwei Verwender: app/ranglisten/loading.tsx zeichnet damit den
// Erstaufbau der Seite, und die Suspense-Grenze in page.tsx denselben
// Zustand beim Wechsel der Motorklasse. Lägen die beiden doppelt vor, liefen
// sie auseinander — und ein Skelett, das nicht mehr zur echten Liste passt,
// erzeugt genau den Sprung, den es verhindern soll. Dieselbe Lehre steht
// schon in components/ui/PageSkeleton.tsx.

export function LeaderboardSectionSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="h-4 w-32 rounded-sm" />
      {/* Eine Card mit divide-y, nicht acht einzelne Karten: sonst springt
          die Liste beim Auflösen um mehrere Trennlinien zusammen. */}
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
 * Das Raster der vier Ranglisten als Platzhalter. Gezeichnet wird nur die
 * erste: auf schmalen Viewports liegt alles darunter ohnehin unter der Falz,
 * und vier volle Listen wären mehr Flimmern als Information. Das Raster
 * selbst steht vollständig da, damit die Spaltenaufteilung nicht springt.
 */
export default function LeaderboardListsSkeleton() {
  return (
    <div className="flex flex-col gap-8 sm:grid sm:grid-cols-2 sm:items-start sm:gap-6 xl:grid-cols-4">
      <LeaderboardSectionSkeleton />
    </div>
  );
}
