import Skeleton from "@/components/ui/Skeleton";
import { BottomNavSkeleton, HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Bisher fiel die Streckendetailseite auf app/loading.tsx zurück, das die
// Explore-Liste zeichnet — beim Öffnen einer Strecke blitzte also die Liste
// auf, aus der man gerade gekommen war. Diese Datei spiegelt stattdessen
// components/RouteDetailLayout.tsx: Karte vollflächig, Detail-Sheet darüber
// (Peek 320 px), ab md Detailspalte links und Karte rechts.
const SHEET_PEEK_PX = 320;

/**
 * Renders a responsive loading skeleton for the route detail page.
 *
 * @returns The route detail loading layout.
 */
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
        <Skeleton className="absolute inset-0 md:static md:order-2 md:h-auto md:flex-1" />

        <div
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-lg border-t border-border bg-background shadow-overlay md:contents"
          style={{ height: `${SHEET_PEEK_PX}px` }}
        >
          <div className="flex shrink-0 items-center justify-center py-2 md:hidden">
            <Skeleton className="h-5 w-5 rounded-sm" />
          </div>

          <div className="flex w-full flex-col gap-5 overflow-hidden border-border px-5 pt-6 pb-[calc(5.75rem+var(--safe-bottom))] sm:px-6 sm:pt-8 sm:pb-[calc(6.25rem+var(--safe-bottom))] md:max-w-md md:border-r md:pb-8 lg:max-w-lg xl:max-w-xl">
            {/* Region, Streckenname, Start → Ziel */}
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-28 rounded-sm" />
              <Skeleton className="h-9 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-56 rounded-sm" />
            </div>

            {/* Merken/Offline/Teilen-Zeile */}
            <div className="flex flex-wrap items-start gap-2">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-32 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>

            {/* "Strecke starten" — auf der echten Seite die auffälligste
                Fläche im Peek-Bereich. */}
            <Skeleton className="h-[50px] rounded-lg" />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[86px] rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </main>
      <BottomNavSkeleton />
    </div>
  );
}
