"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronDown, Crosshair, SearchX } from "lucide-react";
import { routeShapePath } from "@/lib/routeShape";
import { formatKm } from "@/lib/format";
import { type RouteSignature, type SignatureKey } from "@/lib/signature";
import type { ExploreRoute } from "@/types/database";
import { anzahlText, type Streckenbewertung } from "@/lib/bewertungen";
import Sternschnitt from "@/components/Sternschnitt";
import { fieldClassName } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { SIGNATURE_ICONS, SIGNATUR_KLASSEN } from "@/components/signaturStil";

// Wortlaut der Farblegende, in der Reihenfolge der Tokens in globals.css.
const LEGENDE: { key: SignatureKey; text: string }[] = [
  { key: "kehren", text: "Viele Kehren" },
  { key: "steigung", text: "Steile Steigung" },
  { key: "hoehe", text: "Hoch hinauf" },
  { key: "tempo", text: "Durchschnittlich erlaubtes Tempo" },
  { key: "laenge", text: "Lange Strecke" },
];



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
        <h1 className="sr-only">Die schönsten Strecken der Schweiz</h1>
      ) : (
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Die schönsten Strecken der Schweiz
          </h1>
          {/* Zwei Zeilen statt drei, auf 390 px gemessen. Beide Aussagen
              bleiben — kuratiert, und aufzeichnen geht ohne Konto —, nur
              "Aussuchen, losfahren" fällt weg: das sagt die Liste darunter
              besser als ein Satz darüber. Die gesparte Zeile ist rund 21 px,
              und die gehen im Peek-Fenster direkt an die Streckenliste
              (Rechnung in ExploreView.tsx bei SHEET_PEEK_PX). */}
          <p className="text-sm text-muted">
            Kurven, Pässe, Aussicht — handverlesen. Aufzeichnen geht ohne Konto.
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
          // Der Platzhalter verschwindet beim Tippen und ist kein Name —
          // ohne aria-label meldete ein Screenreader nur "Suchfeld".
          aria-label="Strecken suchen"
          className={fieldClassName("min-h-11")}
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

      {/* Die Legende zu den fünf Signaturtönen. Die Farbe ist nie die
          einzige Kodierung (Icon und Wort stehen an jeder Zeile, siehe
          lib/signature.ts), aber sie ist die erste, die man sieht — und im
          Review blieb offen, warum eine Strecke violett und die nächste
          orange ist. Zugeklappt, damit sie die Liste nicht nach unten
          schiebt; wer fragt, findet die Antwort an der Stelle der Frage. */}
      <details className="group text-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-muted transition-colors duration-fast hover:text-foreground [&::-webkit-details-marker]:hidden">
          Was die Farben bedeuten
          <ChevronDown
            className="h-4 w-4 transition-transform duration-fast group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <p className="pb-2 text-xs text-muted">
          Jede Strecke zeigt, worin sie unter allen Strecken am meisten heraussticht:
        </p>
        <ul className="grid grid-cols-1 gap-1.5 pb-2 sm:grid-cols-2">
          {LEGENDE.map(({ key, text }) => {
            const Icon = SIGNATURE_ICONS[key];
            return (
              <li key={key} className={`flex items-center gap-2 text-xs ${SIGNATUR_KLASSEN[key].text}`}>
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {text}
              </li>
            );
          })}
        </ul>
      </details>

      <ul className="flex flex-col gap-1">
        {routes.length === 0 && loadError && (
          <li role="alert" className="text-sm text-danger">
            Strecken konnten nicht geladen werden. Bitte versuche es später erneut.
          </li>
        )}
        {routes.length === 0 && !loadError && (
          <li>
            {/* Mit Ausweg statt nur mit Befund: der Leerzustand sagte, dass
                nichts passt, und liess die Suche stehen — zurück kam man nur,
                indem man das Feld selbst leerte. Ohne Suchbegriff ist die
                leere Liste dagegen eine Tatsache über die Daten, kein
                Sackgassenzustand; dann steht auch kein Knopf da. */}
            <EmptyState
              icon={SearchX}
              title={
                searchQuery.trim()
                  ? `Keine Strecke passt zu „${searchQuery.trim()}“.`
                  : "Noch keine Strecken in diesem Ausschnitt."
              }
              action={
                searchQuery.trim() ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Suche zurücksetzen
                  </button>
                ) : undefined
              }
            />
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
          // Ohne Signatur (kann nicht vorkommen, solange computeSignatures
          // auf demselben Bestand lief — der Typ lässt es trotzdem zu) bleibt
          // die Zeile bei der neutralen Strukturkante.
          const ton = signature ? SIGNATUR_KLASSEN[signature.key] : null;

          return (
            <li key={route.id}>
              <Link
                href={`/strecken/${route.id}`}
                onMouseEnter={() => onHoverRoute(route.id)}
                onMouseLeave={() => onHoverRoute(null)}
                onFocus={() => onHoverRoute(route.id)}
                onBlur={() => onHoverRoute(null)}
                // h-20 statt h-24: die Zeile trägt Name, Länge, das
                // Signatur-Merkmal, den Sternenschnitt und die Streckenform —
                // 80 px reichen dafür und liegen weiter deutlich über jeder
                // Antippgrenze. Zusammen mit der Suchzeile oben macht das im
                // Peek-Fenster aus einer angeschnittenen Zeile zwei volle
                // plus Anschnitt.
                //
                // DER LINKE RAND TRÄGT DEN SIGNATURTON, NICHT DEN AKZENT.
                //
                // Die Unterscheidung, die hier vorher stand, gilt weiter und
                // ist der Grund, warum das geht: der Akzent ist in dieser App
                // die eine Farbe für "hier steht ein Wert"
                // (components/Sterne.tsx). In dieser Zeile steht ein Wert —
                // der Sternenschnitt —, und trüge der Rand ebenfalls den
                // Akzent, wäre die Regel keine mehr.
                //
                // Der Signaturton ist kein Akzent, sondern eine eigene
                // Kategorie: er sagt, WAS für eine Strecke das ist, und sagt
                // es an drei Stellen derselben Zeile (Kante, Label, Form).
                // Der Akzent bleibt dem einen Wert und dem Hover, der ein
                // Zustand ist und keine dauerhafte Markierung.
                //
                // border-l-[3px] bleibt: die Kante ist das, was man beim
                // Überfliegen der Liste zuerst sieht, und 3 px sind auch
                // ohne Farbwahrnehmung noch eine Kante.
                className={`group flex h-20 items-center gap-3 border-b border-border border-l-[3px] py-3 pr-2 pl-3 transition-colors duration-fast hover:bg-accent-subtle active:bg-accent-subtle ${ton?.rand ?? "border-l-border-strong"}`}
              >
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                  <span className="truncate text-base font-medium transition-colors duration-fast group-hover:text-accent">
                    {route.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {showPlainKm && (
                      // shrink-0 und whitespace-nowrap: ohne beides ist diese
                      // Zahl das erste, was der Flexbox ausgeht. Am Preview
                      // auf 390 px nachgesehen — aus "33.1 km" wurden zwei
                      // Zeilen, "33.1" über "km", und die Zeile wuchs über
                      // ihre 80 px hinaus.
                      //
                      // Schrumpfen soll das Signatur-Label daneben: es hat
                      // truncate und kürzt mit Auslassungspunkten, was bei
                      // "Ø erlaubt 114 km/h" lesbar bleibt. Eine umbrechende
                      // Masszahl ist dagegen nie richtig.
                      <span className="shrink-0 text-sm tabular-nums whitespace-nowrap text-muted">
                        {formatKm(route.laenge_km)} km
                      </span>
                    )}
                    {signature && (
                      <span className="flex min-w-0 items-center gap-1.5">
                        {/* Icon und Label im Signaturton. Bei text-xs ist die
                            Schwelle 4,5:1 — genau daran war die alte Palette
                            gescheitert (drei von fünf fielen im hellen Theme
                            durch). Die Tokens dahinter sind gegen alle drei
                            Untergründe gerechnet, auf denen diese Zeile
                            vorkommt; der schlechteste Wert ist 4,70:1. */}
                        {(() => {
                          const SignatureIcon = SIGNATURE_ICONS[signature.key];
                          return (
                            <SignatureIcon
                              className={`h-3 w-3 shrink-0 ${ton?.text ?? "text-muted"}`}
                              aria-hidden="true"
                            />
                          );
                        })()}
                        <span
                          className={`truncate text-xs font-medium tracking-wide ${ton?.text ?? "text-muted"}`}
                        >
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
                      <Sternschnitt
                        schnitt={bewertung.schnitt}
                        zahlClassName="text-xs text-muted"
                        sternClassName="h-3 w-3"
                      >
                        <span className="sr-only">{anzahlText(bewertung.anzahl)}</span>
                      </Sternschnitt>
                    )}
                  </div>
                </div>

                {/* SVG-Routenform im Signaturton auf --color-surface. Die
                    Fläche bleibt neutral — getönt wäre sie ein vierter Ton
                    in derselben Zeile, und die Form darauf müsste dann gegen
                    ihn gerechnet werden statt gegen die zwei Untergründe, die
                    es ohnehin gibt.

                    Kein Foto hier: hochgeladene Fahrt-Fotos sind bewusst nur
                    auf der jeweiligen Streckenseite (Fotos-Sektion) bzw. der
                    Fahrt-Detailseite sichtbar, nicht als Vorschaubild in der
                    Explore-Liste.

                    h-14 statt h-16, passend zur auf 80 px verkürzten Zeile. */}
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-surface">
                  {shape && (
                    <svg
                      viewBox="0 0 64 48"
                      aria-hidden="true"
                      className={`absolute inset-0 h-full w-full opacity-80 transition-opacity duration-fast group-hover:opacity-100 ${ton?.text ?? "text-muted"}`}
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
