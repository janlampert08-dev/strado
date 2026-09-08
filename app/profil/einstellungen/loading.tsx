import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import PageSkeleton from "@/components/ui/PageSkeleton";

// Eigenes Skelett, obwohl app/profil/loading.tsx eine Ebene darüber liegt:
// Next.js nimmt das nächstgelegene loading.tsx, und das Profil-Skelett
// zeichnet Avatar, Kennzahlen und Fahrten — nichts davon steht hier.
// Spiegelt stattdessen app/profil/einstellungen/page.tsx: Überschrift plus
// fünf Abschnitte (Privatsphäre, Darstellung, Streckenvorschläge, Konto,
/**
 * Renders a loading skeleton for the profile settings page.
 */

export default function Loading() {
  return (
    <PageSkeleton maxWidth="max-w-2xl lg:max-w-3xl">
      <Skeleton className="h-9 w-56 rounded-md" />

      <section className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32 rounded-sm" />
        <Skeleton className="h-4 w-full rounded-sm" />
        <Card className="flex flex-col gap-4 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-48 rounded-sm" />
              <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
            </div>
          ))}
        </Card>
      </section>

      {Array.from({ length: 3 }).map((_, i) => (
        <section key={i} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40 rounded-sm" />
          <Card className="flex flex-col gap-3 p-4">
            <Skeleton className="h-4 w-56 rounded-sm" />
            <Skeleton className="h-8 w-40 rounded-lg" />
          </Card>
        </section>
      ))}
    </PageSkeleton>
  );
}
