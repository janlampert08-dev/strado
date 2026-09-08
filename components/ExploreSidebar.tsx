"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { Gauge, Mountain, Route, Ruler, SearchX, TrendingUp } from "lucide-react";
import { routeShapePath } from "@/lib/routeShape";
import { formatKm } from "@/lib/format";
import { withAlpha, type RouteSignature, type SignatureKey } from "@/lib/signature";
import type { RouteGeoJSON } from "@/types/database";
import { fieldClassName } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

// Icon je Signatur-Merkmal — spiegelt visuell wider, worin die Strecke
// heraussticht (Kehren -> kurvige Straße, Tempo -> Tacho, etc.), statt für
// alle Merkmale dasselbe Mountain-Symbol zu zeigen.
const SIGNATURE_ICONS: Record<SignatureKey, typeof Mountain> = {
  kehren: Route,
  steigung: TrendingUp,
  hoehe: Mountain,
  tempo: Gauge,
  laenge: Ruler,
};

export default function ExploreSidebar({
  routes,
  loadError = false,
  loggedIn,
  searchQuery,
  onSearchChange,
  signatures,
  userLocation,
  locating,
  locationError,
  onRequestLocation,
  onHoverRoute,
}: {
  routes: RouteGeoJSON[];
  loadError?: boolean;
  loggedIn: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  signatures: Map<string, RouteSignature>;
  userLocation: [number, number] | null;
  locating: boolean;
  locationError: string | null;
  onRequestLocation: () => void;
  onHoverRoute: (id: string | null) => void;
}) {
  // Nur bei Änderung des Streckenbestands neu berechnet — sonst würde jeder
  // Hover (der über onHoverRoute den State im Elternteil ändert) hier eine
  // erneute Pfadberechnung für alle Karten auslösen.
  const shapes = useMemo(
    () =>
      new Map(
        routes.map((r) => [
          r.id,
          routeShapePath(r.geometry_geojson.coordinates as [number, number][], 64, 48, 4),
        ]),
      ),
    [routes],
  );

  return (
    // pb reserviert unter md zusätzlich Platz für die fixierte BottomNav +
    // den sicheren Bereich (Home-Indicator) — die globale main{padding-bottom}-
    // Regel (globals.css) greift hier nicht, weil dieses div (nicht <main>)
    // der scrollende Container ist. Ab md verschwindet die BottomNav
    // (md:hidden), daher md:pb-6 als Reset auf den ursprünglichen Wert.
    <div className="flex w-full flex-col gap-5 overflow-y-auto overscroll-y-contain border-border px-5 pt-5 pb-[calc(5.5rem+var(--safe-bottom))] sm:px-6 sm:pt-6 sm:pb-[calc(5.75rem+var(--safe-bottom))] md:max-w-sm md:border-r md:pb-6 lg:max-w-md xl:max-w-lg">
      {/* Die Startseite hatte weder <h1> noch einen erklärenden Satz: Ein
          Erstbesucher sah ein Suchfeld, einen Chip und eine Liste und
          erfuhr nirgends, was Strado ist oder dass er Fahrten aufzeichnen
          kann. Für Suchmaschinen war die Seite damit ohne Überschrift.
          sr-only wäre für ihn falsch — der Satz ist gerade für sehende
          Erstbesucher gedacht.

          Wer angemeldet ist, weiss aber, was Strado ist, und bekäme den
          Satz bei jedem Öffnen der App erneut vorgesetzt. Auf Mobile zählt
          das doppelt: das Sheet zeigt in Peek-Höhe (SHEET_PEEK_PX in
          ExploreView.tsx) nur wenige Zeilen, und ohne den Absatz sind das
          Suchfeld und die ersten Strecken statt der Erklärung. Die <h1>
          bleibt dann als sr-only stehen, damit die Seite ihre Überschrift
          für Screenreader und Suchmaschinen behält — nur der erklärende
          Absatz entfällt. */}
      {loggedIn ? (
        <h1 className="sr-only">Die schönsten Strecken der Schweiz</h1>
      ) : (
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Die schönsten Strecken der Schweiz
          </h1>
          <p className="text-sm text-muted">
            Kurven, Pässe, Aussicht — handverlesen. Aussuchen, losfahren, aufzeichnen. Ein Konto
            brauchst du erst zum Speichern.
          </p>
        </div>
      )}

      <input
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Strecke, Region oder Ort suchen…"
        className={fieldClassName()}
      />

      <div className="flex flex-col items-start gap-2 border-b border-border pb-6">
        {/* Chip-Form (rounded-full, px-3 py-1.5, text-sm) statt
            buttonVariants' secondary/sm (rounded-lg, text-xs) — beibehalten
            aus der Zeit, als hier noch die Kategorie-Chips daneben standen,
            und weiterhin passend: neben dem Suchfeld ist das das einzige
            verbliebene Bedienelement über der Liste und soll leichter wirken
            als ein Formular-Button. */}
        <button
          onClick={onRequestLocation}
          disabled={locating}
          className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-fast hover:border-border-strong active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {locating
            ? "Suche Standort…"
            : userLocation
              ? "Standort aktualisieren"
              : "Strecken in meiner Nähe"}
        </button>
        {/* Antwort auf eine gerade ausgelöste Nutzeraktion — role="alert",
            damit sie angesagt wird. Vorher in text-xs text-muted, also im
            hellsten Grauton und der kleinsten Schriftgrösse: eine
            Fehlermeldung, die aussah wie eine Fussnote. */}
        {locationError && <p role="alert" className="text-sm text-danger">{locationError}</p>}
      </div>

      <ul className="flex flex-col gap-1">
        {routes.length === 0 && loadError && (
          <li role="alert" className="text-sm text-danger">
            Strecken konnten nicht geladen werden. Bitte versuche es später erneut.
          </li>
        )}
        {routes.length === 0 && !loadError && (
          <li>
            <EmptyState icon={SearchX} title="Keine Strecken für diese Suche." />
          </li>
        )}
        {routes.map((route) => {
          const signature = signatures.get(route.id);
          const shape = shapes.get(route.id);
          // Wenn das Signatur-Merkmal selbst die Länge ist (signature.label
          // lautet dann z.B. "24 km lang"), nicht zusätzlich eine separate
          // km-Zahl daneben zeigen — sonst steht dieselbe Länge zweimal da.
          const showPlainKm = signature?.key !== "laenge";
          // Fallback als Literal-Hex statt CSS-Variable: withAlpha() (siehe
          // lib/signature.ts) parst den Wert als #RRGGBB, ein var(...) würde
          // das brechen. Entspricht --color-muted im Light Mode; im Dark Mode
          // (#8F95A3) ein kaum wahrnehmbarer Unterschied — echte Auflösung
          // bräuchte eine JS-seitige Farbaufl. der CSS-Variable, außerhalb
          // des Scopes dieser Phase (lib/signature.ts bleibt unangetastet).
          const trackColor = signature?.color ?? "#8A8F98";

          return (
            <li key={route.id}>
              <Link
                href={`/strecken/${route.id}`}
                onMouseEnter={() => onHoverRoute(route.id)}
                onMouseLeave={() => onHoverRoute(null)}
                onFocus={() => onHoverRoute(route.id)}
                onBlur={() => onHoverRoute(null)}
                style={
                  {
                    "--track-color": trackColor,
                    "--track-hover-bg": withAlpha(trackColor, 0.1),
                    borderLeftColor: withAlpha(trackColor, 0.55),
                  } as CSSProperties
                }
                className="group flex h-24 items-center gap-3 border-b border-border border-l-[3px] py-3 pr-2 pl-3 transition-colors duration-fast hover:bg-[var(--track-hover-bg)] active:bg-[var(--track-hover-bg)]"
              >
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                  <span className="truncate text-base font-medium transition-colors duration-fast group-hover:text-[var(--track-color)]">
                    {route.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {showPlainKm && (
                      <span className="font-mono text-sm tabular-nums text-muted">
                        {formatKm(route.laenge_km)} km
                      </span>
                    )}
                    {signature && (
                      <span className="flex items-center gap-1.5">
                        {(() => {
                          const SignatureIcon = SIGNATURE_ICONS[signature.key];
                          return (
                            <SignatureIcon
                              className="h-3 w-3 shrink-0"
                              style={{ color: signature.color }}
                              aria-hidden="true"
                            />
                          );
                        })()}
                        <span
                          className="truncate text-xs font-medium tracking-wide"
                          style={{ color: signature.color }}
                        >
                          {signature.label}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* SVG-Routenform auf getöntem Signaturfarb-Hintergrund — kein
                    Foto hier: hochgeladene Fahrt-Fotos sind bewusst nur auf
                    der jeweiligen Streckenseite (Fotos-Sektion) bzw. der
                    Fahrt-Detailseite sichtbar, nicht als Vorschaubild in der
                    Explore-Liste. */}
                <div
                  className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md"
                  style={{ backgroundColor: withAlpha(trackColor, 0.12) }}
                >
                  {shape && (
                    <svg
                      viewBox="0 0 64 48"
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full opacity-80 transition-opacity duration-fast group-hover:opacity-100"
                    >
                      <path
                        d={shape}
                        fill="none"
                        stroke={trackColor}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
