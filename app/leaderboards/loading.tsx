import Skeleton from "@/components/ui/Skeleton";
import PageSkeleton from "@/components/ui/PageSkeleton";
import LeaderboardListsSkeleton from "@/components/LeaderboardListsSkeleton";

// Spiegelt app/leaderboards/page.tsx: Überschrift im text-display-Grad,
// darunter die Chip-Leiste, darunter die Ranglisten.
//
// Der erklärende Absatz unter der Überschrift ist entfallen, hier wie dort —
// ein Skelett, das eine Zeile zeichnet, die es nicht mehr gibt, erzeugt beim
// Auflösen genau den Sprung, den es verhindern soll.
//
// Die Listen kommen aus components/LeaderboardListsSkeleton.tsx, weil die
// Suspense-Grenze in page.tsx dasselbe Bild braucht. Zwei Kopien liefen
// auseinander.

export default function Loading() {
  return (
    <PageSkeleton maxWidth="max-w-2xl lg:max-w-5xl">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-56 rounded-md" />
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
