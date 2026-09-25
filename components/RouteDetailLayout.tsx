"use client";

import { useRef, useState, type ReactNode } from "react";
import DragSheet from "@/components/ui/DragSheet";
import RouteDetailMap from "@/components/RouteDetailMap";
import { useAufzeichnung } from "@/components/AufzeichnungsKontext";
import type { RouteGeoJSON } from "@/types/database";
import { formatKm } from "@/lib/format";

// Gleiche Bottom-Sheet-Mechanik wie auf der Startseite (ExploreView.tsx):
// Mobile zeigt die Karte vollflächig, das Detail-Panel liegt als per
// Ziehgriff auf-/zuziehbares Sheet darüber (Peek zeigt Titel + Aktionen,
// aufgezogen die vollen Details über die ganze Karte, ganz nach unten
// gewischt bleibt nur der Ziehgriff stehen und die Karte liegt frei).
// Ab md: zurück zur ursprünglichen Liste-links/Karte-rechts-Aufteilung,
// siehe DragSheet.tsx.
const SHEET_PEEK_PX = 320;

export default function RouteDetailLayout({
  route,
  aktion,
  children,
}: {
  route: RouteGeoJSON;
  /**
   * Die Hauptaktion der Seite ("Strecke fahren"). Sie steht NICHT im
   * scrollenden Inhalt, sondern als feste Leiste an dessen Fuss — siehe
   * den Kommentar am Rendern unten.
   */
  aktion?: ReactNode;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLElement>(null);
  // Wie viel der Karte das Sheet gerade verdeckt — die Karte passt ihren
  // Ausschnitt auf die *sichtbare* Fläche ein statt auf den ganzen Container,
  // siehe RouteMap.tsx (bottomInsetPx). Die Karte wird deshalb hier gerendert
  // und nicht mehr als fertiges ReactNode von der Seite hereingereicht: nur
  // hier ist der Wert bekannt, und die Seite ist eine Server Component, kann
  // also keine Callback-Prop durchreichen.
  const [verdecktUnten, setVerdecktUnten] = useState(0);
  // Während einer laufenden Aufzeichnung (GefahrenSection geöffnet) hängt die
  // Detailkarte aus — der Aufzeichnungs-Dialog bringt seine eigene Karte mit,
  // und zwei WebGL-Instanzen gleichzeitig machen die Aufzeichnung auf dem
  // Telefon zäh (siehe AufzeichnungsKontext.tsx). Der Platzhalter hält die
  // Geometrie (absolute Fläche), damit beim Wieder-Einhängen nichts springt.
  const { aktiv: aufzeichnungAktiv } = useAufzeichnung();

  return (
    <main ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
      {/* Sprunglink für die Tastatur: die Karte steht im DOM vor dem Sheet,
          und Tab lief erst durch alle Mapbox-Bedienelemente und die drei
          Ebenen-Knöpfe, bevor "Strecke fahren" kam. Unsichtbar, bis er den
          Fokus hat. */}
      <a
        href="#streckeninfo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-overlay"
      >
        Zur Streckeninfo
      </a>
      {/* Die Hauptaktion steht im DOM nach dem ganzen Inhalt (feste
          Fussleiste, siehe unten) — per Tab käme sie erst nach allen
          Reitern. Deshalb ein zweiter Sprunglink direkt dorthin. */}
      {aktion && (
        <a
          href="#fahren"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-overlay"
        >
          Zu „Strecke fahren“
        </a>
      )}
      {/* Kein role="img" um die interaktive Karte (siehe ExploreView):
          der Navigationsschalter darin bleibt für Tastatur und
          Hilfstechnik erreichbar, die Beschreibung steht daneben. */}
      <div className="absolute inset-0 md:static md:order-2 md:h-auto md:flex-1">
        <p className="sr-only">Kartenansicht der Strecke.</p>
        {aufzeichnungAktiv ? (
          <div className="h-full w-full bg-background" aria-hidden="true" />
        ) : (
          <RouteDetailMap route={route} bottomInsetPx={verdecktUnten} key={route.id} />
        )}
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
        onOccludedBottomChange={setVerdecktUnten}
        kompakt={
          <>
            <span className="min-w-0 flex-1 truncate text-base font-semibold">{route.name}</span>
            <span className="shrink-0 text-sm text-muted tabular-nums">
              {formatKm(route.laenge_km)} km
            </span>
          </>
        }
      >
        {/* Die Hauptaktion als feste Fussleiste des Sheets, ausserhalb des
            scrollenden Inhalts. Vorher stand "Strecke fahren" im Reiter
            Fahren, unter Titel, Aktionsknöpfen, Bestzeit und Reiterleiste —
            gemessen bei 390 × 844 rund 100 px UNTER der Peek-Kante (320 px
            minus 44 px Griff). Die wichtigste Handlung der Seite war beim
            ersten Aufruf also nicht zu sehen. Das `sticky bottom-0`, das
            GefahrenSection dafür mitbrachte, griff nie: ein Sticky-Element
            bewegt sich nur innerhalb seines Elternblocks, und der war ein
            div, das nur den Knopf selbst umschloss.

            Den Peek dafür zu erhöhen hätte gegen den Grundsatz aus
            docs/design-vereinfachung.md (3.1) verstossen: das Budget wird im
            Inhalt geholt, nicht am Fenster — die Karte ist die zweite Hälfte
            der Seite. Die Leiste kostet stattdessen rund 70 px vom Inhalt
            und steht dafür bei JEDER Bildschirmhöhe (iPhone SE wie Pro Max),
            in jedem Reiter und auch aufgezogen im Blick. Eingeklappt
            ("versteckt") schneidet das Sheet sie mit weg, und der Wrapper in
            DragSheet macht sie dort inert wie den Rest.

            Ab md steht sie am Fuss der linken Spalte. `empty:hidden`, weil
            GefahrenSection während der Aufzeichnung nichts an Ort und Stelle
            rendert (der Dialog hängt per Portal an body) — ohne blieb ein
            leerer Streifen mit Trennlinie stehen.

            Die max-w- und border-r-Klassen sitzen jetzt auf dieser Spalte
            statt auf #streckeninfo: ab md ist sie das echte Flex-Kind von
            main (DragSheet wird dort display:contents). */}
        <div className="flex min-h-0 w-full flex-1 flex-col border-border md:max-w-md md:border-r lg:max-w-lg xl:max-w-xl">
          {/* Kein Sonderpolster mehr für die BottomNav — das Sheet endet
              inzwischen über der Leiste (bottom: var(--bottom-nav-h), siehe
              DragSheet.tsx). pb-8 ist der Wert, der vorher ab md galt, wo es
              die Leiste nie gab. */}
          <div id="streckeninfo" tabIndex={-1} className="flex min-h-0 w-full flex-1 flex-col gap-5 overflow-y-auto outline-none overscroll-y-contain px-5 pt-6 pb-8 sm:px-6 sm:pt-8">
            {children}
          </div>
          {aktion && (
            <div id="fahren" tabIndex={-1} className="shrink-0 border-t border-border bg-background px-5 py-3 outline-none empty:hidden sm:px-6">
              {aktion}
            </div>
          )}
        </div>
      </DragSheet>
    </main>
  );
}
