import Skeleton from "@/components/ui/Skeleton";
import { BottomNavSkeleton, HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Skelett der Startseite — und ausschliesslich davon. Alle anderen Segmente
// haben inzwischen ein eigenes loading.tsx, sonst zeichnete diese Datei ihre
// Explore-Form (Karte plus Streckenliste) auch für Seiten, die völlig anders
// aussehen.
//
// Die Masse stammen aus components/ExploreView.tsx und
// components/ExploreSidebar.tsx: Sheet-Peek, Seitenleistenbreite,
// Zeilenhöhe. Weichen sie ab, entsteht beim Auflösen genau der Sprung, den
// ein Skelett verhindern soll.
const SHEET_PEEK_PX = 272;

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Karte: unter md vollflächig hinter dem Sheet, ab md die rechte
            Spalte (md:order-2) — identisch zu ExploreView. */}
        <Skeleton className="absolute inset-0 md:static md:order-2 md:h-auto md:flex-1" />

        {/* Bottom-Sheet in Peek-Höhe; ab md löst sich der Wrapper auf
            (md:contents), und die Liste wird zur linken Spalte. */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-lg border-t border-border bg-background shadow-overlay md:contents"
          style={{ height: `${SHEET_PEEK_PX}px` }}
        >
          {/* Ziehgriff (nur unter md, wie in DragSheet.tsx) */}
          <div className="flex shrink-0 items-center justify-center py-2 md:hidden">
            <Skeleton className="h-5 w-5 rounded-sm" />
          </div>

          <div className="flex w-full flex-col gap-5 overflow-hidden border-border px-5 pt-5 pb-[calc(5.5rem+var(--safe-bottom))] sm:px-6 sm:pt-6 sm:pb-[calc(5.75rem+var(--safe-bottom))] md:max-w-sm md:border-r md:pb-6 lg:max-w-md xl:max-w-lg">
            {/* Kein Block für die Einleitung. Sie steht seit dem Umbau der
                Startseite nur noch für abgemeldete Besucher
                (ExploreSidebar.tsx); angemeldet bleibt an ihrer Stelle eine
                sr-only-Überschrift ohne Höhe. Ein loading.tsx ist der
                Suspense-Platzhalter der Seite und kennt die Sitzung nicht —
                es muss sich also für einen der beiden Fälle entscheiden.

                Die Wahl fällt auf den angemeldeten: dieses Skelett sieht ein
                Konto bei jedem Wechsel auf die Startseite, ein abgemeldeter
                Besucher ein- bis zweimal überhaupt. Der Sprung, den wir uns
                einhandeln, trifft damit die seltenere Seite. */}
            {/* Suchfeld */}
            <Skeleton className="h-10 rounded-md" />

            {/* Standort-Chip plus die Trennlinie darunter */}
            <div className="flex flex-col items-start gap-2 border-b border-border pb-6">
              <Skeleton className="h-8 w-44 rounded-full" />
            </div>

            {/* Streckenliste: sechs Zeilen in der Höhe der echten Einträge
                (h-24, farbiger Balken links, Text links, Vorschau rechts). */}
            <div className="flex flex-col gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-24 items-center gap-3 border-b border-l-[3px] border-border py-3 pr-2 pl-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                    <Skeleton className="h-5 w-2/3 rounded-sm" />
                    <Skeleton className="h-4 w-1/2 rounded-sm" />
                  </div>
                  <Skeleton className="h-16 w-20 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <BottomNavSkeleton />
    </div>
  );
}
