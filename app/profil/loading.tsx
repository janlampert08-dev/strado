import Skeleton from "@/components/ui/Skeleton";

// Eigenes Skelett für dieses Segment. Ohne das greift app/loading.tsx —
// und das zeichnet die Explore-Form (Karte links, Streckenliste rechts),
// die zu dieser Seite gar nicht passt: Der Nutzer sieht beim Navigieren
// kurz ein Layout, das gleich von einem völlig anderen ersetzt wird.

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 px-5 py-6 sm:px-6">
      {/* Kopfbereich: Avatar plus Name */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
      </div>
      {/* Kennzahlen */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      {/* Fahrtenliste */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
