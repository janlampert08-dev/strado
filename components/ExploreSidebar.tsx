"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Crosshair, Route, SearchX } from "lucide-react";
import { routeShapePath } from "@/lib/routeShape";
import { type Empfehlung } from "@/lib/empfehlung";
import { formatKmGerundet, mitAnzahl } from "@/lib/format";
import { type RouteSignature } from "@/lib/signature";
import type { ExploreRoute } from "@/types/database";
import { anzahlText, type Streckenbewertung } from "@/lib/bewertungen";
import Sternschnitt from "@/components/Sternschnitt";
import { fieldClassName } from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import Button, { buttonVariants } from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { SIGNATURE_ICONS, SIGNATUR_KLASSEN } from "@/components/signaturStil";

// Hierarchie aus einer statt aus dreien: Genau eine Strecke ist empfohlen —
// im Grundzustand die bestbewertete (lib/empfehlung.ts). Sie steht ganz oben
// auf einer Fläche mit Begründung darüber, der Rest bleibt bewusst volle
// Zeile MIT Form: Die übrigen Strecken rücken nicht in den Hintergrund, sie
// treten nur einen Schritt zurück. Bei Suche oder Standort gibt es keine
// angeheftete Empfehlung — dort gilt Trefferliste bzw. Nähe-Sortierung.

function kuerzen(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

import type { ExploreArt } from "@/components/ExploreView";

export default function ExploreSidebar({
  routes,
  bewertungen,
  loadError = false,
  loggedIn,
  anzahlStrecken,
  searchQuery,
  onSearchChange,
  artFilter,
  onArtFilterChange,
  signatures,
  empfehlung,
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
  /** Der ganze Bestand, ungefiltert — routes ist schon die Trefferliste. */
  anzahlStrecken: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  artFilter: ExploreArt;
  onArtFilterChange: (art: ExploreArt) => void;
  signatures: Map<string, RouteSignature>;
  /** Genau eine Empfehlung (oder keine bei Suche/Fehler) — siehe lib/empfehlung.ts. */
  empfehlung: Empfehlung | null;
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
            Kurze Runden wie Pässe — handverlesen. Aufzeichnen geht ohne Konto.
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

      {/* Zwei Funnel, eine Liste: kurz & nah (Agglo-Runden ab Haustür,
          ≤70 km) und Pässe & Berge (Höhe/Kehren/Name-Heuristik in
          ExploreView.tsx). 44 px Chips, eine Zeile, horizontal scrollbar —
          kostet keine Listenhöhe im Peek, weil sie die Trennlinie ersetzt,
          nicht ergänzt. */}
      <div
        role="group"
        aria-label="Strecken filtern"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {(
          [
            { wert: "alle", label: "Alle" },
            { wert: "kurz", label: "Kurz & nah" },
            { wert: "berg", label: "Pässe & Berge" },
          ] as const
        ).map((chip) => {
          const aktiv = artFilter === chip.wert;
          return (
            <button
              key={chip.wert}
              type="button"
              aria-pressed={aktiv}
              onClick={() => onArtFilterChange(chip.wert)}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                aktiv
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Antwort auf eine gerade ausgelöste Nutzeraktion — role="alert",
          damit sie angesagt wird. */}
      {locationError && <p role="alert" className="text-sm text-danger">{locationError}</p>}

      <div className="border-b border-border" />

      {/* Keine Farbkasten-Legende mehr: fünf Signaturtöne mit Wort + Icon
          an jeder Zeile brauchen keine eigene Erklärungsebene, die im
          Peek-Fenster Platz kostet. Die Bedeutung steht dort, wo sie
          gefragt ist — an der Strecke selbst. */}

      {/* Zwei verschiedene Leeren: eine Suche ohne Treffer lässt sich mit
          einem Tipp zurücknehmen, ein leerer Bestand nicht. Vorher sagte
          beide "für diese Suche", auch wenn gar nichts gesucht war. Der
          Vorschlag steht in beiden Fällen, weil die fehlende Strecke genau
          die ist, die jemand kennt und die Karte noch nicht.

          Ausserhalb der <ul> und in einer Live-Region, die immer im DOM
          steht: vorher war der Leerzustand das einzige <li> der Liste
          ("Liste, 1 Element"), und dass das Tippen die Treffer auf null
          brachte, sagte ein Screenreader gar nicht an. */}
      <div role="status" className="flex flex-col gap-2">
        {/* Sichtbare Trefferzahl für Sehende, dieselbe Live-Region für
            Hilfstechnik: vorher sah man nur, dass die Liste kürzer wurde.
            Eine Zeile in text-xs kostet im Peek-Fenster rund 16 px und macht
            aus "die Liste ist kürzer" ein "3 von 9 Strecken". */}
        {!loadError && (
          <p className="text-xs tabular-nums text-muted">
            {routes.length === anzahlStrecken
              ? mitAnzahl(anzahlStrecken, "Strecke", "Strecken")
              : `${routes.length} von ${mitAnzahl(anzahlStrecken, "Strecke", "Strecken")}`}
          </p>
        )}
        {routes.length === 0 && !loadError && (
          searchQuery.trim() ? (
            <EmptyState
              icon={SearchX}
              kompakt
              // Auf 24 Zeichen gekürzt: der Titel muss auf 390 px einzeilig bleiben,
              // sonst rutscht "Suche zurücksetzen" abgemeldet unter die Peek-Kante (nachgemessen: 283 px Inhaltsfläche).
              // «» statt „“: das Schweizer Anführungszeichen.
              title={`Keine Strecke zu «${kuerzen(searchQuery.trim(), 24)}».`}
              // Die Zahl statt eines allgemeinen Tipps: wer "Klausen"
              // getippt hat, weiss schon, dass man nach Pässen suchen kann.
              // Was er nicht weiss, ist, wie klein der Bestand noch ist.
              description={`Gesucht in Namen, Regionen, Start- und Zielorten von ${mitAnzahl(anzahlStrecken, "Strecke", "Strecken")}. Kennst du eine, die fehlt, schlag sie vor.`}
              action={
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" size="md" onClick={() => onSearchChange("")}>
                    Suche zurücksetzen
                  </Button>
                  <Link href="/strecken/neu" className={buttonVariants({ variant: "ghost", size: "md" })}>
                    Strecke vorschlagen
                  </Link>
                </div>
              }
            />
          ) : artFilter !== "alle" ? (
            <EmptyState
              kompakt
              icon={Route}
              title={
                artFilter === "kurz"
                  ? "Noch keine kurze Runde hier."
                  : "Noch kein Pass hier."
              }
              description="Kennst du eine Strasse, die man gefahren sein muss? Schlag sie vor — Agglo wie Pass zählen."
              action={
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" size="md" onClick={() => onArtFilterChange("alle")}>
                    Alle anzeigen
                  </Button>
                  <Link href="/strecken/neu" className={buttonVariants({ variant: "ghost", size: "md" })}>
                    Strecke vorschlagen
                  </Link>
                </div>
              }
            />
          ) : (
            <EmptyState
              kompakt
              icon={Route}
              title="Noch keine Strecken freigegeben."
              description="Kennst du eine Strasse, die man gefahren sein muss? Schlag sie vor."
              action={
                <Link href="/strecken/neu" className={buttonVariants({ variant: "secondary", size: "md" })}>
                  Strecke vorschlagen
                </Link>
              }
            />
          )
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {routes.length === 0 && loadError && (
          <li>
            <div role="alert" className="flex flex-col gap-3 py-2">
              <p className="text-sm text-danger">
                Strecken konnten nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.
              </p>
              <Button variant="secondary" size="md" onClick={() => window.location.reload()}>
                Erneut versuchen
              </Button>
            </div>
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
          const istEmpfohlen = empfehlung !== null && route.id === empfehlung.id;
          // Die Begründung steht an der Empfehlung, nicht irgendwo darüber.
          // Nur "bestbewertet" nennt einen Grund — der Bestand-Fallback
          // behauptet ehrlich keinen.
          const empfehlungsText = !istEmpfohlen
            ? null
            : empfehlung.grund === "bewertung"
              ? "Für dich empfohlen · bestbewertet"
              : "Für dich empfohlen";

          return (
            <li key={route.id}>
              <Link
                href={`/strecken/${route.id}`}
                onMouseEnter={() => onHoverRoute(route.id)}
                onMouseLeave={() => onHoverRoute(null)}
                onFocus={() => onHoverRoute(route.id)}
                onBlur={() => onHoverRoute(null)}
                // Alle Zeilen tragen Name, Länge, Signatur-Merkmal,
                // Sternenschnitt und Streckenform — 80 px reichen dafür und
                // liegen weiter deutlich über jeder Antippgrenze. Zusammen
                // mit der Suchzeile oben macht das im Peek-Fenster aus einer
                // angeschnittenen Zeile zwei volle plus Anschnitt.
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
                // Hierarchie aus einer: Die Empfehlung steht auf einer Fläche
                // (rounded, border, surface) mit Begründung darüber und
                // grösserer Form — der Rest bleibt volle Zeile MIT Form, damit
                // ein Dutzend Strecken kein Hintergrundrauschen wird.
                className={`group flex items-center gap-3 border-l-[3px] py-3 pr-2 pl-3 transition-colors duration-fast hover:bg-accent-subtle active:bg-accent-subtle ${ton?.rand ?? "border-l-border-strong"} ${istEmpfohlen ? "min-h-24 rounded-xl border border-border bg-surface" : "h-20 border-b border-border"}`}
              >
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                  {empfehlungsText && (
                    // Neutral statt Akzent: Die Empfehlung ist kein Wert und
                    // kein Zustand, sondern eine Einordnung — der Akzent
                    // bleibt Wert (Sterne) und Hover vorbehalten.
                    <span className="truncate text-xs font-medium text-muted">
                      {empfehlungsText}
                    </span>
                  )}
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
                        {formatKmGerundet(route.laenge_km)} km
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
                    {/* Kein Passzustand auf der Startseite: Auch gesperrt oder
                        eingeschränkt wird hier nicht als Abzeichen gezeigt —
                        der Stand steht auf der Strecke und unter /paesse. */}
                  </div>
                </div>

                {/* Die Form gehört zu jeder Zeile: Erst sie macht aus der
                    Liste lesbare Strecken statt blosser Namen — der Rest
                    rückt einen Schritt zurück (ohne Fläche, ohne Begründung),
                    aber nicht in den Hintergrund. Die Empfehlung zeigt sie
                    grösser. Ihre Wanne läuft dort auf dem Seitenhintergrund,
                    weil sie auf der Fläche sonst unsichtbar wäre. */}
                <div className={`relative shrink-0 overflow-hidden rounded-md ${istEmpfohlen ? "h-16 w-24 bg-background" : "h-14 w-20 bg-surface"}`}>
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
