import Skeleton from "@/components/ui/Skeleton";

// components/FreeRideForm.tsx belegt den ganzen Bildschirm (FullscreenDialog:
// Karte oben, Kennzahlen und Bedienleiste unten) und rendert weder Kopfleiste
// noch BottomNav — deshalb hier bewusst kein PageSkeleton. Ohne diese Datei
// griff app/loading.tsx und zeichnete die Explore-Liste, obwohl der Nutzer
/**
 * Displays a full-screen loading skeleton for the free-ride form.
 *
 * @returns The loading layout for the map area and bottom control panel.
 */

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <Skeleton className="min-h-0 flex-1" />
      <div className="flex flex-col gap-3 border-t border-border-strong bg-background p-4 pb-[calc(1rem+var(--safe-bottom))]">
        <Skeleton className="h-3 w-32 rounded-sm" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-16 rounded-sm" />
              <Skeleton className="h-7 w-24 rounded-sm" />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 rounded-lg" />
      </div>
    </div>
  );
}
