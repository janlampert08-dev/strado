import type { ReactNode } from "react";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";

// Gemeinsames Grundgerüst für alle Segment-Skelette (app/**/loading.tsx).
//
// Der Grund für diese Datei ist ein konkreter Fehler in den bisherigen
// Skeletten: keines davon zeichnete die Kopfleiste oder die BottomNav. Beide
// gehören aber zu jeder echten Seite (Header.tsx rendert BottomNav gleich
// mit), also verschwanden sie bei jeder Navigation für die Dauer des
// Ladens und sprangen danach zurück — auf Mobile sogar mitsamt dem
// Platzhalter, den die globale main{padding-bottom}-Regel unten reserviert.
// Ein Skelett, das Rahmenelemente weglässt, erzeugt genau den Sprung, den es
// verhindern soll.

/**
 * Kopfleiste als Skelett — spiegelt components/Header.tsx: dieselbe
 * sticky-Positionierung, dieselben Abstände, dieselbe Trennlinie. Die
 * Wortmarke ist ein Block in ihrer tatsächlichen Grösse (h-[18px], Breite aus
 * WORTMARKE.seitenverhaeltnis ≈ 3.958 → 71px), damit nichts umbricht, sobald
 * die echte Kontur einrückt.
 */
export function HeaderSkeleton() {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
      <Skeleton className="h-[18px] w-[71px] rounded-sm" />
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {/* Das Flammen-Icon (Aktivität) rechts aussen — auf jeder
            Bildschirmgrösse sichtbar, anders als die Textnavigation. */}
        <Skeleton className="h-8 w-8 rounded-full" />
        {/* Textnavigation nur ab md, genau wie im Header selbst. */}
        <div className="hidden items-center gap-3 sm:gap-6 md:flex">
          <Skeleton className="h-4 w-16 rounded-sm" />
          <Skeleton className="h-4 w-12 rounded-sm" />
          <Skeleton className="h-4 w-20 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

/**
 * Die fixierte Tab-Leiste als Skelett — spiegelt components/BottomNav.tsx
 * (fünf Spalten, Icon über Beschriftung, safe-area-Padding unten).
 */
export function BottomNavSkeleton() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "max(var(--safe-bottom), 0px)" }}
      aria-hidden="true"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1 py-2.5">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-2.5 w-10 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Rahmen für die zentrierten Inhaltsseiten (Profil, Feed, Bestenlisten,
 * Aktivität, Fahrtdetail, …): Kopfleiste, scrollender Bereich, zentriertes
 * <main> mit denselben Innenabständen wie die echten Seiten.
 *
 * @param maxWidth Die max-w-*-Klassen der jeweiligen Seite, inklusive
 *   Breakpoint-Varianten (z. B. "max-w-2xl lg:max-w-4xl").
 * @param children Die seitenspezifischen Platzhalter. Der Abstand zwischen
 *   ihnen ist hier gap-6; Seiten mit grösseren Abständen setzen ihn in
 *   ihrem eigenen Skelett nach.
 */
export default function PageSkeleton({
  maxWidth = "max-w-2xl",
  children,
}: {
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <div className="flex-1 overflow-y-auto">
        <main className={cn("mx-auto flex w-full flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10", maxWidth)}>
          {children}
        </main>
      </div>
      <BottomNavSkeleton />
    </div>
  );
}
