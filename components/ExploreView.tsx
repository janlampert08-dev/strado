"use client";

import KartePlatzhalter from "@/components/ui/KartePlatzhalter";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ZUFALLSSTRECKE_EVENT } from "@/components/LogoLink";
import ExploreSidebar from "@/components/ExploreSidebar";
import DragSheet from "@/components/ui/DragSheet";
import { haversineKm } from "@/lib/geo";
import { brauchtUrlSync, echoEinordnen, matchesSearch } from "@/lib/search";
import type { RouteSignature } from "@/lib/signature";
import { waehleEmpfohleneStrecke, type Empfehlung } from "@/lib/empfehlung";
import type { ExploreRoute } from "@/types/database";
import type { Streckenbewertung } from "@/lib/bewertungen";
import type { PassZustand } from "@/lib/passStatus";

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

// Zwei Einstiege, eine Liste: kurze Runden ab Haustür (Agglo-Loops,
// ≤70 km) und Pässe & Berge (Wochenende, teilen). Die Unterscheidung
// ist eine Heuristik über die kuratierten Felder — kein Schema, kein
// Filter-Backend: hoehe/kehren/Name statt neuer Spalte, damit Bestand und
// Teilen-Bild unangetastet bleiben. Agglo ist kein Second-Class-Bestand,
// sondern der zweite Funnel neben dem Pass.
export type ExploreArt = "alle" | "kurz" | "berg";

function istBergPass(route: ExploreRoute): boolean {
  if ((route.hoehe_m ?? 0) >= 800) return true;
  if ((route.kehren ?? 0) >= 8) return true;
  return /pass/i.test(
    `${route.name} ${route.region} ${route.start_ort} ${route.ziel_ort}`,
  );
}

function passtZurArt(route: ExploreRoute, art: ExploreArt): boolean {
  if (art === "alle") return true;
  if (art === "berg") return istBergPass(route);
  return route.laenge_km <= 70;
}

// mapbox-gl ist eine schwere Abhängigkeit (WebGL, eigenes CSS) — dynamisch
// geladen, damit Suchfeld/Streckenliste interaktiv werden, ohne auf den
// Kartencode zu warten, statt beides in einem Chunk zu bündeln. ssr:false,
// da mapbox-gl direkten DOM-/WebGL-Zugriff braucht.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <KartePlatzhalter />,
});

// Bottom-Sheet-Masse (Mobile). Aufgezogen deckt das Sheet die Karte
// vollständig ab (siehe DragSheet.tsx) — der Kontext "wo bin ich?" hängt
// dann an der Liste selbst, nicht mehr an einem Streifen Karte.
//
// 360 statt 320: nachgemessen bleiben damit rund 159 px für die Liste —
// zwei volle Zeilen plus Anschnitt statt einer plus Anschnitt. Die Karte
// behält auf 390 x 844 noch rund 329 px. Agglo-Runde wie Pass teilen sich
// dieselbe Liste: wer über einen Share-Link kommt, sieht Namen statt
// Kacheln, egal ob kurze Runde oder Wochenende.
const SHEET_PEEK_PX = 360;

// Wie lange der Zufallsvorschlag (siehe unten) stehen bleibt. Die Kamerafahrt
// dorthin dauert 800 ms, danach bleiben gut vier Sekunden zum Lesen und
// Antippen — kurz genug, um die Karte nicht dauerhaft zu belegen.
const ZUFALLSVORSCHLAG_MS = 5000;

export default function ExploreView({
  routes,
  signaturen,
  bewertungen,
  passZustaende,
  loadError = false,
  loggedIn,
}: {
  routes: ExploreRoute[];
  /** Signatur-Merkmal je Strecken-ID, serverseitig über den ganzen Bestand
   *  gerechnet (getRoutes() in lib/routes.ts). */
  signaturen: Record<string, RouteSignature>;
  /** Sternenschnitt je Strecken-ID; Strecken ohne Wertung fehlen. */
  bewertungen: Record<string, Streckenbewertung>;
  /** Schwerwiegendster Passzustand je Strecke; Strecken ohne Pass fehlen. */
  passZustaende: Record<string, PassZustand>;
  loadError?: boolean;
  loggedIn: boolean;
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
  // Die Werte, die der Effekt unten in die URL geschrieben hat und deren Echo
  // noch aussteht. Sie unterscheiden das Echo eines eigenen Schreibvorgangs
  // von einer fremden Änderung (siehe echoEinordnen). Eine Liste und nicht
  // der zuletzt gesendete Wert allein, weil bei langsamer Antwort zwei
  // Sendungen gleichzeitig unterwegs sein können. Bewusst State und keine
  // Ref: gelesen wird sie im Render-Abgleich direkt darunter, und eine Ref
  // dort zu lesen ist genau das, was react-hooks/refs verbietet — unter
  // StrictMode läuft der Render zweimal, und ein Wert, der sich zwischen
  // beiden Durchläufen ändert, führte zu zwei verschiedenen Ergebnissen.
  const [offeneSuchsendungen, setOffeneSuchsendungen] = useState<string[]>([]);
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
    // Nur eine fremde Änderung darf das Feld überschreiben. Beim eigenen Echo
    // bleibt stehen, was seit dem Abschicken dazugetippt wurde; der Effekt
    // unten zieht die URL gleich darauf nach.
    const verbleibend = echoEinordnen(urlSearchQuery, offeneSuchsendungen);
    if (verbleibend === null) {
      setSearchInput(urlSearchQuery);
    } else {
      setOffeneSuchsendungen(verbleibend);
    }
  }

  useEffect(() => {
    if (!brauchtUrlSync(searchInput, urlSearchQuery)) return;
    const timeout = setTimeout(() => {
      setOffeneSuchsendungen((bisher) => [...bisher, searchInput.trim()]);
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
  const [zufallsstrecke, setZufallsstrecke] = useState<ExploreRoute | null>(null);

  // Bottom-Sheet-Container (nur < md relevant — ab md greift die feste
  // Liste-links/Karte-rechts-Aufteilung unverändert, siehe Klassen unten).
  // Die eigentliche Drag-/Tap-Mechanik steckt in DragSheet.tsx, wiederverwendet
  // auf der Routendetailseite (app/strecken/[id]/page.tsx).
  const containerRef = useRef<HTMLElement>(null);
  // Wie viel der Karte das Sheet gerade verdeckt (siehe DragSheet.tsx). Die
  // Karte passt ihren Ausschnitt damit auf die sichtbare Fläche ein statt auf
  // den ganzen Container — sonst läge die untere Hälfte der eingepassten
  // Strecken unter dem Sheet.
  const [verdecktUnten, setVerdecktUnten] = useState(0);

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
  // Signatur-Merkmal je Strecke stabil bleibt — eine Textsuche schränkt nur
  // die sichtbare Auswahl ein, ohne die Perzentile (und damit die Merkmale)
  // der übrigen Strecken zu verschieben. Gerechnet wird seit 2026-09-25 auf
  // dem Server (getRoutes()), damit die Tempolimit-Segmente, aus denen der
  // Schnitt kommt, nicht mehr in der Seitennutzlast stehen; hier wird das
  // Objekt nur in die Map zurückverwandelt, die die Seitenleiste erwartet.
  //
  // Die Signatur trägt Icon, Text UND Farbe — Letzteres wieder, seit die
  // fünf Töne als Design-Tokens in app/globals.css stehen statt als
  // Hex-Konstanten (siehe lib/signature.ts). Dieselbe Map speist deshalb
  // beides: die Seitenleiste und die Kartenlinien.
  const signatures = useMemo(() => new Map(Object.entries(signaturen)), [signaturen]);

  // Nur der Schlüssel, ohne das Label — mehr braucht die Karte nicht, und
  // ein eigener useMemo hält die RouteMap-Prop stabil, statt bei jedem
  // Render eine neue Map zu übergeben (der setData-Effekt dort führt sie in
  // seinen Abhängigkeiten).
  const kartenSignaturen = useMemo(
    () => new Map([...signatures].map(([id, sig]) => [id, sig.key])),
    [signatures],
  );
  const [artFilter, setArtFilter] = useState<ExploreArt>("alle");
  const visibleRoutes = useMemo(() => {
    // searchInput statt des (debounced) URL-Werts: die Liste soll bei jedem
    // Tastendruck sofort reagieren, nicht erst nach dem URL-Sync-Delay.
    // Art-Filter (Agglo vs. Pass) läuft davor — beides sind explizite
    // Absichten, keine angeheftete Empfehlung.
    const nachArt = artFilter === "alle" ? routes : routes.filter((r) => passtZurArt(r, artFilter));
    const filtered = searchInput.trim()
      ? nachArt.filter((r) => matchesSearch(r, searchInput))
      : nachArt;

    if (!userLocation) return filtered;

    return [...filtered].sort(
      (a, b) =>
        haversineKm(userLocation, a.start_geojson.coordinates) -
        haversineKm(userLocation, b.start_geojson.coordinates),
    );
  }, [routes, searchInput, userLocation, artFilter]);

  // Genau eine Empfehlung für die Hierarchie der Liste — und sie steht ganz
  // oben, ausser der Nutzer filtert oder sortiert selbst: Bei Suche oder
  // Standort ist die Liste eine explizite Absicht (Treffer bzw. Nähe), in
  // die keine angeheftete Empfehlung gehört. Im Grundzustand (keine Suche,
  // kein Standort) ist es die bestbewertete Strecke (lib/empfehlung.ts),
  // an erster Stelle der angezeigten Liste.
  const hatFilter = searchInput.trim() !== "" || artFilter !== "alle";
  const hatStandort = userLocation !== null;
  const empfehlung: Empfehlung | null = useMemo(() => {
    if (hatFilter || hatStandort || loadError) return null;
    return waehleEmpfohleneStrecke(
      routes.map((r) => r.id),
      bewertungen,
    );
  }, [routes, hatFilter, hatStandort, loadError, bewertungen]);

  // Die Empfehlung wird an die erste Stelle gestellt, der Rest behält seine
  // Reihenfolge. Bei Filter/Standort ist empfehlung null und die Liste
  // bleibt, wie sie ist (Treffer bzw. nähe-sortiert).
  const angezeigteRouten = useMemo(() => {
    if (!empfehlung) return visibleRoutes;
    const index = visibleRoutes.findIndex((r) => r.id === empfehlung.id);
    if (index <= 0) return visibleRoutes;
    return [visibleRoutes[index], ...visibleRoutes.slice(0, index), ...visibleRoutes.slice(index + 1)];
  }, [visibleRoutes, empfehlung]);

  useEffect(() => {
    function handleZufallsstrecke() {
      const auswahl = angezeigteRouten[Math.floor(Math.random() * angezeigteRouten.length)];
      // Bei leerer Trefferliste (etwa während einer Suche ohne Treffer)
      // passiert schlicht nichts — besser als eine leere Meldung.
      if (!auswahl) return;
      setZufallsstrecke(auswahl);
    }
    window.addEventListener(ZUFALLSSTRECKE_EVENT, handleZufallsstrecke);
    return () => window.removeEventListener(ZUFALLSSTRECKE_EVENT, handleZufallsstrecke);
  }, [angezeigteRouten]);

  useEffect(() => {
    if (!zufallsstrecke) return;
    const timeout = setTimeout(() => setZufallsstrecke(null), ZUFALLSVORSCHLAG_MS);
    return () => clearTimeout(timeout);
  }, [zufallsstrecke]);

  return (
    <main ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
      {/* Kein role="img" um die interaktive Karte: darin sitzt der
          Mapbox-Navigationsschalter mit fokussierbaren Knöpfen — in einem
          role="img" wären sie aus dem Accessibility-Baum beschnitten,
          blieben aber in der Tab-Reihenfolge. Die Beschreibung steht als
          sr-only-Absatz daneben. */}
      <div className="absolute inset-0 md:static md:order-2 md:h-auto md:flex-1">
        <p className="sr-only">
          Kartenansicht der Strecken — die vollständige Liste steht in der Seitenleiste.
        </p>
        <RouteMap
          umlandSchleier
          routes={angezeigteRouten}
          signaturen={kartenSignaturen}
          userLocation={userLocation}
          // Hover und Zufallsvorschlag speisen denselben
          // Hervorhebungs-Layer, bleiben aber getrennte Zustände: der
          // Vorschlag darf einen laufenden Hover weder überschreiben noch
          // beim Ausblenden mit abräumen. Der Hover hat Vorrang — er folgt
          // dem Zeiger und ist damit die aktuellere Absicht. Die Empfehlung
          // liegt darunter: sichtbar auf der Karte, aber leiser als beides.
          hoveredRouteId={hoveredRouteId ?? zufallsstrecke?.id ?? empfehlung?.id ?? null}
          flyToRouteId={zufallsstrecke?.id ?? null}
          bottomInsetPx={verdecktUnten}
        />
      </div>

      {/* Der Vorschlag selbst — oben über der Karte, damit er weder das
          Sheet noch die Kopfleiste verdeckt. pointer-events-none auf dem
          Rahmen, damit die Karte darunter bedienbar bleibt; nur die Pille
          selbst nimmt Klicks an.

          z-10 statt z-20, seit das Sheet bis nach oben aufgezogen werden
          kann: gleiche Ebene wie das Sheet, das im DOM danach kommt und die
          Pille deshalb verdeckt, sobald es über sie hinauswächst. Mit z-20
          klebte sie sonst mitten im aufgezogenen Inhalt. */}
      {zufallsstrecke && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-5">
          <Link
            href={`/strecken/${zufallsstrecke.id}`}
            className="pointer-events-auto max-w-full truncate rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-overlay backdrop-blur-xl transition-colors duration-fast hover:text-accent-ink"
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
        handleLabels={{ expand: "Liste ausklappen", collapse: "Liste einklappen" }}
        onOccludedBottomChange={setVerdecktUnten}
      >
        <ExploreSidebar
          routes={angezeigteRouten}
          bewertungen={bewertungen}
          passZustaende={passZustaende}
          loadError={loadError}
          loggedIn={loggedIn}
          anzahlStrecken={routes.length}
          searchQuery={searchInput}
          onSearchChange={setSearchInput}
          artFilter={artFilter}
          onArtFilterChange={setArtFilter}
          signatures={signatures}
          empfehlung={empfehlung}
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
