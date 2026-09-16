import type { ReactNode } from "react";
import Skeleton from "@/components/ui/Skeleton";
import Seitenrahmen, { type Seitenbreite } from "@/components/ui/Seitenrahmen";

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
 *
 * Ein Platzhalter für jede Breite, weil die echte Kopfleiste auf jeder Breite
 * die Wortmarke zeigt (LogoLink.tsx). Am 14. September 2026 stand hier unter
 * sm ein gezeichnetes Signet, passend zur damaligen Kopfleiste; mit deren
 * Rückbau ist es wieder ein Block. Diese Datei hat keine eigene Meinung
 * darüber, welche Marke oben steht — sie spiegelt nur, was danach kommt,
 * sonst springt genau der Sprung, den sie verhindern soll.
 */
export function HeaderSkeleton() {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3 backdrop-blur-xl sm:px-6 sm:pt-[calc(1rem+var(--safe-top))] sm:pb-4">
      <Skeleton className="h-[18px] w-[71px] rounded-sm" />
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {/* Hier stand bis zur Review von PR #254 ein rundes Flammen-Icon —
            der eigene Aktivitäts-Knopf, den der Kopf damals rechts aussen
            trug. Seit "Aktivität" ein gewöhnlicher Nav-Eintrag ist
            (lib/nav.ts), gibt es ihn nicht mehr, und das Skelett blitzte
            ihn bei JEDER Navigation auf JEDER Seite kurz auf: genau der
            Sprung, den diese Datei laut ihrem eigenen Kopf verhindern soll.

            Textnavigation nur ab md, genau wie im Header selbst. */}
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
 * Der Rahmen kommt aus components/ui/Seitenrahmen.tsx — derselbe Baustein,
 * den die echten Seiten benutzen. Bis zur Review von PR #254 schrieb diese
 * Datei die Polsterung wörtlich noch einmal hin und nahm die Breite als
 * freien String entgegen; damit gab es zwei Quellen für dieselbe Geometrie,
 * und sie waren bereits auseinandergelaufen: sieben Skelette standen auf
 * einer anderen Breite als ihre Seite, zwei auf einem anderen Seitenabstand.
 * Auf dem Desktop ruckte dadurch die Spaltenbreite bei jedem Seitenwechsel.
 *
 * Eine Breite, die hier nicht zu wählen ist, gehört nach Seitenrahmen — und
 * damit auch auf die Seite. Genau das ist der Zweck.
 *
 * @param breite Dieselbe Breite, die die Seite an Seitenrahmen übergibt.
 * @param children Die seitenspezifischen Platzhalter. Der Abstand zwischen
 *   ihnen ist gap-6; Seiten mit grösseren Abständen setzen ihn in ihrem
 *   eigenen Skelett nach.
 */
export default function PageSkeleton({
  breite = "normal",
  children,
}: {
  breite?: Seitenbreite;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite={breite}>{children}</Seitenrahmen>
      </div>
      <BottomNavSkeleton />
    </div>
  );
}
