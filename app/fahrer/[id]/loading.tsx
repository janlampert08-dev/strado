import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/fahrer/[id]/page.tsx: Avatar mit Name und Folgen-Zählern,
// Folgen-Button rechts, die Kennzahlen-Card, die Garage und die Liste der
// geteilten Fahrten. Welche Blöcke tatsächlich erscheinen, hängt an den
// Sichtbarkeits-Einstellungen des Fahrers — das Skelett kann das nicht
// wissen und zeichnet den vollständigen Fall, weil ein fehlender Block
/**
 * Displays a loading skeleton for the driver profile page.
 *
 * @returns The driver profile page loading skeleton.
 */

export default function Loading() {
  return (
    <PageSkeleton maxWidth="max-w-2xl lg:max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-9 w-48 rounded-md" />
            <Skeleton className="h-4 w-40 rounded-sm" />
          </div>
        </div>
        <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
      </div>

      <Card className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-4 w-28 rounded-sm" />
            <Skeleton className="h-6 w-20 rounded-sm" />
          </div>
        ))}
      </Card>

      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28 rounded-sm" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-lg" />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Skeleton className="h-4 w-36 rounded-sm" />
        <Card className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-3">
              <Skeleton className="h-4 flex-1 rounded-sm" />
              <Skeleton className="h-4 w-16 shrink-0 rounded-sm" />
            </div>
          ))}
        </Card>
      </section>
    </PageSkeleton>
  );
}
