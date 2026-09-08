import Skeleton from "@/components/ui/Skeleton";

// components/NeueStreckeForm.tsx rendert die Seite ohne Kopfleiste und ohne
// BottomNav: Karte zum Setzen der Wegpunkte, darüber das Formular-Sheet.
// Deshalb hier bewusst kein PageSkeleton — ein Kopfbalken im Skelett wäre
// genau die Sorte Sprung, die diese Dateien vermeiden sollen. Bewusst grob:
// wer hier landet, wartet auf ein Formular, nicht auf Inhalte.
const SHEET_PEEK_PX = 280;

export default function Loading() {
  return (
    <main className="relative flex h-dvh flex-1 flex-col overflow-hidden md:flex-row">
      <Skeleton className="absolute inset-0 md:static md:order-first md:h-auto md:flex-1" />

      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-lg border-t border-border bg-background shadow-overlay md:contents"
        style={{ height: `${SHEET_PEEK_PX}px` }}
      >
        <div className="flex shrink-0 items-center justify-center py-2 md:hidden">
          <Skeleton className="h-5 w-5 rounded-sm" />
        </div>

        <div className="flex w-full flex-col gap-4 overflow-hidden border-border px-6 pt-8 pb-[calc(2rem+var(--safe-bottom))] md:max-w-sm md:border-r lg:max-w-md">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-4 w-full rounded-sm" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      </div>
    </main>
  );
}
