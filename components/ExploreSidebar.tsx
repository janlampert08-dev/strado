"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Crosshair, Gauge, Mountain, Route, Ruler, SearchX, TrendingUp } from "lucide-react";
import { routeShapePath } from "@/lib/routeShape";
import { formatKm } from "@/lib/format";
import { type RouteSignature, type SignatureKey } from "@/lib/signature";
import type { ExploreRoute } from "@/types/database";
import { schnittText, type Streckenbewertung } from "@/lib/bewertungen";
import Sterne from "@/components/Sterne";
import { fieldClassName } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import IconButton from "@/components/ui/IconButton";

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
  bewertungen,
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
  routes: ExploreRoute[];
  /** Sternenschnitt je Strecken-ID; Strecken ohne Wertung fehlen darin. */
  bewertungen: Record<string, Streckenbewertung>;
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
    // Kein Sonderpolster mehr für die BottomNav: das Sheet endet inzwischen
    // über der Leiste (bottom: var(--bottom-nav-h), siehe DragSheet.tsx),
    // statt darunter durchzulaufen. Das frühere pb schob den Inhalt zwar aus
    // dem verdeckten Streifen heraus, sobald man bis ans Ende scrollte — in
    // Peek-Höhe lagen die untersten Zeilen aber weiterhin unter der Leiste
    // und waren dort nicht antippbar. pb-6 ist der Wert, der vorher ab md
    // galt, wo es die Leiste nie gab.
    <div className="flex w-full flex-col gap-3 overflow-y-auto overscroll-y-contain border-border px-5 pt-3 pb-6 sm:gap-5 sm:px-6 sm:pt-6 md:max-w-sm md:border-r lg:max-w-md xl:max-w-lg">
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
        <h1 className="sr-only">Die schönsten Strecken rund um Zürich</h1>
      ) : (
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Die schönsten Strecken rund um Zürich
          </h1>
          <p className="text-sm text-muted">
            Kurven, Pässe, Aussicht — handverlesen. Aussuchen, losfahren, aufzeichnen. Ein Konto
            brauchst du erst zum Speichern.
          </p>
        </div>
      )}

      {/* Suchfeld und Standort in EINER Zeile. Vorher standen sie
          untereinander, getrennt durch gap-5, und der Standort-Chip trug
          darunter noch pb-6 plus eine Trennlinie: zusammen 78 px, die im
          Peek-Fenster des Bottom-Sheets (272 px, SHEET_PEEK_PX in
          ExploreView.tsx) von der Liste abgingen.

          Gerechnet ergab das 197 px Bedienelemente vor der ersten
          Streckenzeile — bei 96 px Zeilenhöhe blieb angemeldet genau eine
          angeschnittene Zeile übrig, abgemeldet (mit Überschrift und
          Erklärabsatz) begann die Liste unterhalb der Peek-Kante. Auf
          genau der Seite, auf der ein geteilter Link landet.

          Jetzt: 44 px Zeile, 12 px Abstand, Trennlinie direkt darunter.
          Siehe docs/design-vereinfachung.md, Anhang A8. */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Strecke oder Ort"
          className={fieldClassName("min-h-11 rounded-full")}
        />
        {/* Der Standort war eine eigene Zeile mit Textbeschriftung. Als
            Icon-Schaltfläche neben dem Feld kostet er keine Zeilenhöhe mehr
            und behält mit 44 px dieselbe Tippfläche wie vorher. Der Zustand
            steckt jetzt im aria-label statt in sichtbarem Text — deshalb
            title zusätzlich, damit er auf dem Desktop lesbar bleibt. */}
        <IconButton
          onClick={onRequestLocation}
          disabled={locating}
          ton={userLocation ? "aktiv" : "neutral"}
          title={
            locating
              ? "Suche Standort…"
              : userLocation
                ? "Standort aktualisieren"
                : "Strecken in meiner Nähe"
          }
          aria-label={
            locating
              ? "Standort wird gesucht"
              : userLocation
                ? "Standort aktualisieren"
                : "Strecken in meiner Nähe finden"
          }
        >
          <Crosshair className={`h-5 w-5 ${locating ? "animate-pulse" : ""}`} aria-hidden="true" />
        </IconButton>
      </div>

      {/* Antwort auf eine gerade ausgelöste Nutzeraktion — role="alert",
          damit sie angesagt wird. */}
      {locationError && <p role="alert" className="text-sm text-danger">{locationError}</p>}

      <div className="border-b border-border" />

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
          const bewertung = bewertungen[route.id];

          return (
            <li key={route.id}>
              <Link
                href={`/strecken/${route.id}`}
                onMouseEnter={() => onHoverRoute(route.id)}
                onMouseLeave={() => onHoverRoute(null)}
                onFocus={() => onHoverRoute(route.id)}
                onBlur={() => onHoverRoute(null)}
                // h-20 statt h-24: die Zeile trägt Name, eine Kennzahl und
                // die Streckenform — 80 px reichen dafür und liegen weiter
                // deutlich über jeder Antippgrenze. Zusammen mit der
                // Suchzeile oben macht das im Peek-Fenster aus einer
                // angeschnittenen Zeile zwei volle plus Anschnitt.
                //
                // Der linke Rand und der Hover-Grund nehmen den Akzent-Token
                // statt einer der fünf Signaturfarben. Die Auswahl trägt
                // damit nicht mehr die Farbe, sondern die Fläche — was auf
                // einem Telefon im Sonnenlicht ohnehin das Robustere ist.
                className="group flex h-20 items-center gap-3 border-b border-border border-l-[3px] border-l-accent/55 py-3 pr-2 pl-3 transition-colors duration-fast hover:bg-accent-subtle active:bg-accent-subtle"
              >
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                  <span className="truncate text-base font-medium transition-colors duration-fast group-hover:text-accent">
                    {route.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {showPlainKm && (
                      <span className="font-mono text-sm tabular-nums text-muted">
                        {formatKm(route.laenge_km)} km
                      </span>
                    )}
                    {signature && (
                      <span className="flex min-w-0 items-center gap-1.5">
                        {/* Icon und Label in --color-muted. Vorher trugen
                            beide die Signaturfarbe — bei text-xs ist die
                            Schwelle 4,5:1, und drei der fünf Farben fielen
                            im hellen Theme durch, zwei im dunklen. Das Token
                            ist auf beiden Hintergründen nachgerechnet. */}
                        {(() => {
                          const SignatureIcon = SIGNATURE_ICONS[signature.key];
                          return (
                            <SignatureIcon className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
                          );
                        })()}
                        <span className="truncate text-xs font-medium tracking-wide text-muted">
                          {signature.label}
                        </span>
                      </span>
                    )}
                    {/* Zuletzt und shrink-0: die Zeile davor darf kürzen,
                        diese Zahl nicht. Und zuletzt statt zuerst, damit die
                        linke Kante der Liste ausgerichtet bleibt — eine
                        Strecke ohne Wertung liesse eine führende Spalte sonst
                        leer und die Liste ausgefranst aussehen.

                        Ohne eine einzige Wertung steht hier nichts statt
                        "0.0": siehe RatingSection, dieselbe Regel. */}
                    {bewertung && (
                      <span className="flex shrink-0 items-center gap-1">
                        <Sterne wert={bewertung.schnitt} sterneClassName="h-3 w-3" />
                        <span className="font-mono text-xs tabular-nums text-muted">
                          {schnittText(bewertung.schnitt)}
                        </span>
                        <span className="sr-only">
                          von 5 Sternen, {bewertung.anzahl}{" "}
                          {bewertung.anzahl === 1 ? "Bewertung" : "Bewertungen"}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* SVG-Routenform auf --color-surface statt auf einer
                    getönten Signaturfarbe — kein Foto hier: hochgeladene
                    Fahrt-Fotos sind bewusst nur auf der jeweiligen
                    Streckenseite (Fotos-Sektion) bzw. der Fahrt-Detailseite
                    sichtbar, nicht als Vorschaubild in der Explore-Liste.

                    h-14 statt h-16, passend zur auf 80 px verkürzten Zeile. */}
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-surface">
                  {shape && (
                    <svg
                      viewBox="0 0 64 48"
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full text-accent opacity-80 transition-opacity duration-fast group-hover:opacity-100"
                    >
                      <path
                        d={shape}
                        fill="none"
                        stroke="currentColor"
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
