"use client";

import { useRef, type ReactNode } from "react";
import DragSheet from "@/components/ui/DragSheet";

// Gleiche Bottom-Sheet-Mechanik wie auf der Startseite (ExploreView.tsx):
// Mobile zeigt die Karte vollflächig, das Detail-Panel liegt als per
// Ziehgriff auf-/zuziehbares Sheet darüber (Peek zeigt Titel + Aktionen,
// aufgezogen die vollen Details über die ganze Karte). Ab md: zurück zur
// ursprünglichen Liste-links/Karte-rechts-Aufteilung, siehe DragSheet.tsx.
const SHEET_PEEK_PX = 320;

export default function RouteDetailLayout({
  map,
  children,
}: {
  map: ReactNode;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLElement>(null);

  return (
    <main ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
      <div
        className="absolute inset-0 md:static md:order-2 md:h-auto md:flex-1"
        role="img"
        aria-label="Kartenansicht der Strecke"
      >
        {map}
      </div>

      {/* Die max-w- und border-r-Klassen sitzen auf dem inneren div, nicht
          auf DragSheet selbst: DragSheets Wrapper wird ab md zu
          display:contents (siehe DragSheet.tsx) und hat dort keine eigene
          Box mehr — erst dieses div wird ab md zum echten Flex-Kind von
          main, genau wie ExploreSidebar es in ExploreView.tsx über ihre
          eigenen Breiten-Klassen tut. */}
      <DragSheet
        containerRef={containerRef}
        peekPx={SHEET_PEEK_PX}
        handleLabels={{ expand: "Details ausklappen", collapse: "Details einklappen" }}
      >
        {/* Kein Sonderpolster mehr für die BottomNav — das Sheet endet
            inzwischen über der Leiste (bottom: var(--bottom-nav-h), siehe
            DragSheet.tsx). pb-8 ist der Wert, der vorher ab md galt, wo es
            die Leiste nie gab. */}
        <div className="flex w-full flex-col gap-5 overflow-y-auto overscroll-y-contain border-border px-5 pt-6 pb-8 sm:px-6 sm:pt-8 md:max-w-md md:border-r lg:max-w-lg xl:max-w-xl">
          {children}
        </div>
      </DragSheet>
    </main>
  );
}
