import Skeleton from "@/components/ui/Skeleton";

// Eigenes Skelett für dieses Segment. Ohne das greift app/loading.tsx —
// und das zeichnet die Explore-Form (Karte links, Streckenliste rechts),
// die zu dieser Seite gar nicht passt: Der Nutzer sieht beim Navigieren
// kurz ein Layout, das gleich von einem völlig anderen ersetzt wird.

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 px-5 py-6 sm:px-6">
      <Skeleton className="h-7 w-40 rounded-md" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
