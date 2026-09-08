"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ZUFALLSSTRECKE_EVENT } from "@/components/LogoLink";
import ExploreSidebar from "@/components/ExploreSidebar";
import DragSheet from "@/components/ui/DragSheet";
import Skeleton from "@/components/ui/Skeleton";
import { haversineKm } from "@/lib/geo";
import { matchesSearch } from "@/lib/search";
import { computeSignatures } from "@/lib/signature";
import type { RouteGeoJSON } from "@/types/database";

// URL-Sync für den Suchtext wird debounced (siehe searchInput-Effekt unten),
// damit nicht jeder Tastendruck einen router.replace() (und damit einen
// RSC-Request) auslöst — die Eingabe selbst (searchInput) bleibt davon
// unbenommen sofort responsiv, nur der Query-String hinkt bis zu diesem
// Delay hinterher.
const SEARCH_URL_SYNC_DEBOUNCE_MS = 300;

// Der Suchtext ist der einzige Filter, den die Startseite noch führt. Die
// Kategorie-Chips sind hier entfallen, weil das Signatur-Merkmal je Strecke
// (lib/signature.ts) sie in dieser Ansicht ohnehin ablösen sollte, und die
// erweiterten km-/Höhen-/Saison-Filter, weil ein kuratierter Bestand dieser
// Grösse eher gelesen als eingegrenzt wird — beides steht als Modul bereit
// (components/AdvancedFiltersPanel.tsx), sobald der Bestand es wieder
// rechtfertigt. Leerer Suchtext ergibt weiterhin eine saubere URL ohne
// Query-String, statt eines leeren ?q=.
function searchQueryHref(pathname: string, query: string): string {
  const trimmed = query.trim();
  return trimmed ? `${pathname}?${new URLSearchParams({ q: trimmed })}` : pathname;
}

// mapbox-gl ist eine schwere Abhängigkeit (WebGL, eigenes CSS) — dynamisch
// geladen, damit Suchfeld/Streckenliste interaktiv werden, ohne auf den
// Kartencode zu warten, statt beides in einem Chunk zu bündeln. ssr:false,
// da mapbox-gl direkten DOM-/WebGL-Zugriff braucht.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

// Bottom-Sheet-Massse (Mobile). PEEK entspricht ungefähr der bisherigen
// festen Kartenhöhe (h-64 = 256px) plus Platz für den Ziehgriff; EXPANDED_GAP
// lässt oben immer einen Streifen Karte sichtbar, damit der Kontext (wo bin
// ich?) beim voll aufgezogenen Sheet nicht verloren geht.
const SHEET_PEEK_PX = 272;

// Wie lange der Zufallsvorschlag (siehe unten) stehen bleibt. Die Kamerafahrt
// dorthin dauert 800 ms, danach bleiben gut vier Sekunden zum Lesen und
// Antippen — kurz genug, um die Karte nicht dauerhaft zu belegen.
const ZUFALLSVORSCHLAG_MS = 5000;
const SHEET_EXPANDED_GAP_PX = 96;

export default function ExploreView({
  routes,
  loadError = false,
}: {
  routes: RouteGeoJSON[];
  loadError?: boolean;
}) {
  // Der Suchtext wird nicht in eigenem State gehalten *statt* in der URL,
  // sondern zusätzlich: die URL ist die "single source of truth" (teilbar,
  // übersteht Reload und die Rückkehr von der Routendetailseite), das
  // Eingabefeld braucht aber bei jedem Tastendruck eine sofortige Antwort,
  // während der URL-Sync (s.u.) debounced erfolgt. router.replace() (nicht
  // push()) hält dabei die Browser-History sauber.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearchQuery = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(urlSearchQuery);
  // Merkt sich, mit welchem URL-Wert searchInput zuletzt abgeglichen wurde,
  // um externe Änderungen (Browser-Zurück/Vorwärts auf eine URL mit
  // anderem ?q=…) von den eigenen (debounced) Schreibvorgängen zu
  // unterscheiden. Der Abgleich passiert bewusst während des Renders statt
  // in einem useEffect — React "Adjusting state when a prop changes"-Muster
  // — da setState synchron in einem Effekt Render-Kaskaden auslöst
  // (react-hooks/set-state-in-effect).
  const [syncedSearchQuery, setSyncedSearchQuery] = useState(urlSearchQuery);
  if (urlSearchQuery !== syncedSearchQuery) {
    setSyncedSearchQuery(urlSearchQuery);
    setSearchInput(urlSearchQuery);
  }

  useEffect(() => {
    if (searchInput === urlSearchQuery) return;
    const timeout = setTimeout(() => {
      router.replace(searchQueryHref(pathname, searchInput), { scroll: false });
    }, SEARCH_URL_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput, urlSearchQuery, pathname, router]);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  // Vom Logo angestossener Zufallsvorschlag (LogoLink.tsx): auf der
  // Startseite führt ein Klick auf die Wortmarke sonst nirgendwohin.
  const [zufallsstrecke, setZufallsstrecke] = useState<RouteGeoJSON | null>(null);

  // Bottom-Sheet-Container (nur < md relevant — ab md greift die feste
  // Liste-links/Karte-rechts-Aufteilung unverändert, siehe Klassen unten).
  // Die eigentliche Drag-/Tap-Mechanik steckt in DragSheet.tsx, wiederverwendet
  // auf der Routendetailseite (app/strecken/[id]/page.tsx).
  const containerRef = useRef<HTMLElement>(null);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationError("Geolocation wird von diesem Browser nicht unterstützt.");
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.longitude, position.coords.latitude]);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Standortzugriff wurde verweigert."
            : "Standort konnte nicht ermittelt werden.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  // Über den gesamten (ungefilterten) Bestand berechnet, damit das
  // Signatur-Merkmal und seine Farbe je Strecke stabil bleiben — eine
  // Textsuche schränkt nur die sichtbare Auswahl ein, ohne die Perzentile
  // (und damit Merkmale/Farben) der übrigen Strecken zu verschieben.
  const signatures = useMemo(() => computeSignatures(routes), [routes]);
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    signatures.forEach((sig, id) => map.set(id, sig.color));
    return map;
  }, [signatures]);

  const visibleRoutes = useMemo(() => {
    // searchInput statt des (debounced) URL-Werts: die Liste soll bei jedem
    // Tastendruck sofort reagieren, nicht erst nach dem URL-Sync-Delay.
    const filtered = searchInput.trim()
      ? routes.filter((r) => matchesSearch(r, searchInput))
      : routes;

    if (!userLocation) return filtered;

    return [...filtered].sort(
      (a, b) =>
        haversineKm(userLocation, a.start_geojson.coordinates) -
        haversineKm(userLocation, b.start_geojson.coordinates),
    );
  }, [routes, searchInput, userLocation]);

  useEffect(() => {
    function handleZufallsstrecke() {
      const auswahl = visibleRoutes[Math.floor(Math.random() * visibleRoutes.length)];
      // Bei leerer Trefferliste (etwa während einer Suche ohne Treffer)
      // passiert schlicht nichts — besser als eine leere Meldung.
      if (!auswahl) return;
      setZufallsstrecke(auswahl);
      // Derselbe Hervorhebungs-Layer, den auch der Listen-Hover benutzt.
      setHoveredRouteId(auswahl.id);
    }
    window.addEventListener(ZUFALLSSTRECKE_EVENT, handleZufallsstrecke);
    return () => window.removeEventListener(ZUFALLSSTRECKE_EVENT, handleZufallsstrecke);
  }, [visibleRoutes]);

  useEffect(() => {
    if (!zufallsstrecke) return;
    const timeout = setTimeout(() => {
      setZufallsstrecke(null);
      // Nur die eigene Hervorhebung zurücknehmen: zeigt der Zeiger inzwischen
      // auf eine andere Strecke in der Liste, gehört sie dem Hover und darf
      // hier nicht mit abgeräumt werden.
      setHoveredRouteId((aktuell) => (aktuell === zufallsstrecke.id ? null : aktuell));
    }, ZUFALLSVORSCHLAG_MS);
    return () => clearTimeout(timeout);
  }, [zufallsstrecke]);

  return (
    <main ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
      <div
        className="absolute inset-0 md:static md:order-2 md:h-auto md:flex-1"
        role="img"
        aria-label="Kartenansicht der Strecken — die vollständige Liste steht in der Seitenleiste."
      >
        <RouteMap
          routes={visibleRoutes}
          userLocation={userLocation}
          colors={colors}
          hoveredRouteId={hoveredRouteId}
          flyToRouteId={zufallsstrecke?.id ?? null}
        />
      </div>

      {/* Der Vorschlag selbst — oben über der Karte, damit er weder das
          Sheet noch die Kopfleiste verdeckt. pointer-events-none auf dem
          Rahmen, damit die Karte darunter bedienbar bleibt; nur die Pille
          selbst nimmt Klicks an. */}
      {zufallsstrecke && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-5">
          <Link
            href={`/strecken/${zufallsstrecke.id}`}
            className="pointer-events-auto max-w-full truncate rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-overlay backdrop-blur-xl transition-colors duration-fast hover:text-accent"
          >
            Wie wär&rsquo;s mit … {zufallsstrecke.name}?
          </Link>
        </div>
      )}

      {/* Mobile: Bottom-Sheet über der Karte, per Ziehgriff auf- und
          zuziehbar zwischen Peek- und Vollhöhe (siehe DragSheet.tsx).
          Ab md: display:contents statt eigener Box — der Wrapper selbst
          verschwindet aus dem Rendering, ExploreSidebar rutscht direkt als
          Flex-Kind in main hoch und übernimmt dort exakt wie vorher die
          Liste-links/Karte-rechts-Aufteilung über ihre eigenen
          w-full/max-w-*-Klassen. */}
      <DragSheet
        containerRef={containerRef}
        peekPx={SHEET_PEEK_PX}
        expandedGapPx={SHEET_EXPANDED_GAP_PX}
        handleLabels={{ expand: "Liste ausklappen", collapse: "Liste einklappen" }}
      >
        <ExploreSidebar
          routes={visibleRoutes}
          loadError={loadError}
          searchQuery={searchInput}
          onSearchChange={setSearchInput}
          signatures={signatures}
          userLocation={userLocation}
          locating={locating}
          locationError={locationError}
          onRequestLocation={requestLocation}
          onHoverRoute={setHoveredRouteId}
        />
      </DragSheet>
    </main>
  );
}
