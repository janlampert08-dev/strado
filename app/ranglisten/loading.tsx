import Skeleton from "@/components/ui/Skeleton";
import PageSkeleton from "@/components/ui/PageSkeleton";
import LeaderboardListsSkeleton from "@/components/LeaderboardListsSkeleton";

// Spiegelt app/ranglisten/page.tsx: Überschrift im text-display-Grad mit
// Unterzeile, darunter die Chip-Leiste, darunter die Ranglisten.
//
// Die Reiterleiste ist entfallen, hier wie dort: die Ranglisten sind wieder
// ein eigener Bereich mit eigenem Eintrag in der Navigation statt eines
// Reiters auf /feed (lib/nav.ts). Ein Skelett, das eine Leiste zeichnet, die
// es nicht mehr gibt, erzeugt beim Auflösen genau den Sprung, den es
// verhindern soll — und dafür fehlte umgekehrt die Unterzeile, die es jetzt
// gibt.
//
// Die Listen kommen aus components/LeaderboardListsSkeleton.tsx, weil die
// Suspense-Grenze in page.tsx dasselbe Bild braucht. Zwei Kopien liefen
// auseinander.

export default function Loading() {
  return (
    <PageSkeleton breite="weit">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-9 w-56 rounded-md" />
          <Skeleton className="h-4 w-72 max-w-full rounded-sm" />
        </div>
        {/* Die obere Chip-Zeile: drei Pillen in h-9 wie in
            components/MotorklassenChips.tsx ("Alle", "Autos",
            "Motorräder"). Die zweite Zeile mit den Leistungsbändern
            erscheint erst nach einer Auswahl und fehlt deshalb auch hier —
            ein Skelett, das eine Zeile zeichnet, die es beim Auflösen nicht
            gibt, erzeugt genau den Sprung, den es verhindern soll.
            Die Breiten stehen ausgeschrieben und nicht als `w-${n}`:
            Tailwind liest den Quelltext statisch, eine zusammengebaute
            Klasse entsteht gar nicht erst. */}
        <div className="flex gap-1.5 overflow-hidden pb-1">
          {["w-14", "w-20", "w-28"].map((w, i) => (
            <Skeleton key={i} className={`h-9 shrink-0 rounded-full ${w}`} />
          ))}
        </div>
      </div>

      <LeaderboardListsSkeleton />
    </PageSkeleton>
  );
}
