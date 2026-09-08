import Skeleton from "@/components/ui/Skeleton";
import { HeaderSkeleton } from "@/components/ui/PageSkeleton";

// Spiegelt app/anmelden/page.tsx: Kopfleiste, ein schmales, senkrecht
// zentriertes Formular (max-w-sm) und die Rechtstext-Zeile ganz unten.
// Bewusst knapp gehalten — die Seite besteht aus zwei Feldern, ein
// detaillierteres Skelett hätte hier nichts zu zeigen. Ohne diese Datei
// griff app/loading.tsx und zeichnete die Explore-Karte.
//
// Ohne BottomNav-Skelett, obwohl <Header /> die Leiste mitbringt: die
// Rechtstext-Zeile steht auf dieser Seite ganz unten am Bildschirmrand und
// bekäme sonst einen Platzhalter unter sich, den die echte Seite dort nicht
/**
 * Renders the loading skeleton for the login page.
 *
 * @returns The login page loading skeleton
 */

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <Skeleton className="h-9 w-40 rounded-md" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          {/* "Passwort vergessen?" */}
          <Skeleton className="h-4 w-36 rounded-sm" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
        <Skeleton className="h-4 w-56 rounded-sm" />
      </main>
      <div className="flex justify-center pb-6">
        <Skeleton className="h-3 w-40 rounded-sm" />
      </div>
    </div>
  );
}
