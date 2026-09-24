import Skeleton from "@/components/ui/Skeleton";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/paesse/[id]/page.tsx: Brotkrumen und Titel, die Statuskarte,
// das Saisonband, die Streckenkarte. Ohne diese Datei zeigte der Wechsel
// aus der Liste das Gerüst der Liste (app/paesse/loading.tsx) — zehn
// Zeilen, die dann in eine ganz andere Seite springen.
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-40 rounded-sm" />
        <Skeleton className="h-9 w-72 max-w-full rounded-md" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28 rounded-sm" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-44 rounded-sm" />
        <Skeleton className="h-7 w-full rounded-sm" />
        <Skeleton className="h-4 w-64 max-w-full rounded-sm" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48 rounded-sm" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    </PageSkeleton>
  );
}
