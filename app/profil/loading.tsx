import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Spiegelt app/profil/page.tsx: Avatar-Zeile mit Zahnrad, Name/E-Mail,
// zwei gleich breite Buttons, die Statistik-Card (vier Kacheln plus zwei
// aufklappbare Abschnitte), die Fahrten-Card, die Garage und zuunterst die
// Premium-Karte. Vorher zeichnete diese Datei ein Dreier-Kennzahlenraster
/**
 * Renders the loading skeleton for the profile page.
 */

export default function Loading() {
  return (
    <PageSkeleton maxWidth="max-w-2xl lg:max-w-4xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-9 w-56 rounded-md" />
          <Skeleton className="h-4 w-48 rounded-sm" />
          <Skeleton className="h-4 w-40 rounded-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
        </div>
      </div>

      {/* Statistiken */}
      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24 rounded-sm" />
        <Card className="flex flex-col divide-y divide-border">
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[86px] rounded-lg" />
            ))}
          </div>
          {/* Die beiden <details>-Abschnitte (Auszeichnungen, Aktivität) —
              beide standardmässig offen, also je Kopfzeile plus Inhalt. */}
          <div className="flex flex-col gap-4 p-4">
            <Skeleton className="h-5 w-40 rounded-sm" />
            <Skeleton className="h-12 rounded-md" />
          </div>
          <div className="flex flex-col gap-4 p-4">
            <Skeleton className="h-5 w-32 rounded-sm" />
            <Skeleton className="h-20 rounded-md" />
          </div>
        </Card>
      </section>

      {/* Meine Fahrten */}
      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32 rounded-sm" />
        <Card className="flex flex-col divide-y divide-border">
          <div className="flex flex-col gap-4 p-4">
            <Skeleton className="h-5 w-48 rounded-sm" />
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Skeleton className="h-5 w-2/5 rounded-sm" />
                    <Skeleton className="h-3 w-3/5 rounded-sm" />
                  </div>
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          {/* Favoriten sind zugeklappt — nur die Kopfzeile. */}
          <div className="p-4">
            <Skeleton className="h-5 w-36 rounded-sm" />
          </div>
        </Card>
      </section>

      {/* Fahrzeuge */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 rounded-sm" />
          <Skeleton className="h-4 w-24 rounded-sm" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-lg" />
          ))}
        </div>
      </section>

      <Skeleton className="h-32 rounded-lg" />
    </PageSkeleton>
  );
}
