"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { mitAnzahl } from "@/lib/format";
import { useEntwurfSchutz } from "@/components/useEntwurfSchutz";
import dynamic from "next/dynamic";
import { Check } from "lucide-react";
import DragSheet from "@/components/ui/DragSheet";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { GlobeIcon, LockIcon } from "@/components/VisibilityIcons";
import { KATEGORIEN } from "@/lib/constants";
import { fetchDrivingRoute, type DirectionsResult } from "@/lib/mapboxDirections";
import { deriveRouteLocations } from "@/lib/geocoding";
import { proposeRoute, type ProposeRouteState } from "@/lib/actions/routes";
import { Input, Textarea } from "@/components/ui/Input";
import Button, { textAktionClassName } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import SegmentedControl from "@/components/ui/SegmentedControl";

// Gleiche Begründung wie bei RouteMap (ExploreView.tsx): mapbox-gl ist eine
// schwere Abhängigkeit (WebGL, eigenes CSS), und RoutePicker importiert sie
// statisch. Ohne dynamischen Import landet die ganze Bibliothek im First Load
// dieser Seite, statt erst mit der Karte nachgeladen zu werden — RoutePicker
// geht nicht über RouteMap, wurde bei dessen Umstellung also übersehen.
// ssr:false, da mapbox-gl direkten DOM-/WebGL-Zugriff braucht.
const RoutePicker = dynamic(() => import("@/components/RoutePicker"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const initialState: ProposeRouteState = { error: null };

// Gleiche Bottom-Sheet-Mechanik wie auf Startseite (ExploreView.tsx) und
// Routendetailseite (RouteDetailLayout.tsx) — die Karte bleibt hier zudem
// der primäre Bedienweg (Tippen setzt Wegpunkte), die Peek-Höhe zeigt daher
// bewusst nur Titel + Hinweistext + Wegpunkt-Zähler, den Rest des
// Formulars füllt man erst nach dem Aufziehen aus.
//
// 340 statt der früheren 280: seit die Seite die gewohnte Kopfleiste rendert
// (app/strecken/neu/page.tsx), liegt deren BottomNav über den unteren gut
// 60px des Sheets. Ohne den Ausgleich fiele der Schritt-Indikator aus der
// Peek-Ansicht.
const SHEET_PEEK_PX = 340;

type StepState = "done" | "active" | "upcoming";

// Nummerierter Schritt-Indikator: macht sichtbar, dass Benennen/Details erst
// Sinn ergeben, sobald eine Route existiert bzw. ein Name vergeben ist —
// statt alle Felder unsortiert auf einmal zu zeigen.
function StepLabel({ index, label, state }: { index: number; label: string; state: StepState }) {
  return (
    <li className="flex items-center gap-1.5">
      {state === "done" ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
      ) : (
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
            state === "active" ? "border-foreground text-foreground" : "border-border text-muted"
          }`}
        >
          {index}
        </span>
      )}
      <span className={state === "upcoming" ? "text-muted" : "font-medium"}>{label}</span>
    </li>
  );
}

export default function NeueStreckeForm() {
  const containerRef = useRef<HTMLElement>(null);
  const [state, formAction, pending] = useActionState(proposeRoute, initialState);
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [rundfahrt, setRundfahrt] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [directions, setDirections] = useState<DirectionsResult | null>(null);
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [istPrivat, setIstPrivat] = useState(false);
  const [locationPreview, setLocationPreview] = useState<{ startOrt: string; zielOrt: string; region: string } | null>(
    null,
  );
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // Gesetzte Wegpunkte oder ein Name sind Arbeit, die ein Tipp auf "Zurück"
  // bisher wortlos verwarf. Während des Absendens nicht: dann ist der
  // Weg von der Seite der gewollte.
  useEntwurfSchutz("neue-strecke", !pending && (waypoints.length > 0 || name.trim().length > 0));

  const effectiveWaypoints: [number, number][] =
    rundfahrt && waypoints.length >= 2 ? [...waypoints, waypoints[0]] : waypoints;
  const effectiveKey = JSON.stringify(effectiveWaypoints);
  const routing = effectiveWaypoints.length >= 2 && fetchedKey !== effectiveKey;
  const activeDirections = effectiveWaypoints.length >= 2 && fetchedKey === effectiveKey ? directions : null;

  const routeReady = waypoints.length >= 2;
  const nameReady = name.trim().length > 0;
  const routeStepState: StepState = routeReady ? "done" : "active";
  const nameStepState: StepState = !routeReady ? "upcoming" : nameReady ? "done" : "active";
  const detailsStepState: StepState = nameReady ? "active" : "upcoming";

  useEffect(() => {
    if (effectiveWaypoints.length < 2) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      const result = await fetchDrivingRoute(effectiveWaypoints);
      if (cancelled) return;
      setDirections(result);
      setFetchedKey(effectiveKey);
      setRoutingError(result ? null : "Für diese Punkte konnte keine Strasse gefunden werden.");
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey]);

  // Vorschau von Start-/Zielort + Region, sobald die Strassenroute steht —
  // dieselbe Ableitung, die proposeRoute() beim Absenden serverseitig
  // durchführt (deriveRouteLocations), damit man vor dem Absenden sieht, was
  // automatisch erkannt wurde, statt es erst auf der fertigen Streckenseite
  // zu bemerken. Schlägt das Geocoding fehl, bleibt die Vorschau einfach
  // leer — proposeRoute() hat ohnehin einen eigenen Koordinaten-Fallback.
  useEffect(() => {
    if (!activeDirections) return;

    let cancelled = false;
    deriveRouteLocations(activeDirections.coordinates).then((result) => {
      if (!cancelled) setLocationPreview(result);
    });

    return () => {
      cancelled = true;
    };
  }, [activeDirections]);

  function handlePick(point: [number, number]) {
    setWaypoints((prev) => [...prev, point]);
  }

  function undoLast() {
    setWaypoints((prev) => prev.slice(0, -1));
  }

  function reset() {
    setWaypoints([]);
    setResetConfirmOpen(false);
  }

  function toggleTag(value: string) {
    setTags((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  return (
    <main ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
      <div
        className="absolute inset-0 md:static md:order-first md:h-auto md:flex-1"
        aria-label="Karte zum Setzen der Wegpunkte — auf die Karte tippen, um einen Punkt zu setzen."
      >
        <RoutePicker
          waypoints={waypoints}
          previewCoords={activeDirections?.coordinates ?? null}
          onPick={handlePick}
        />
      </div>

      <DragSheet
        containerRef={containerRef}
        peekPx={SHEET_PEEK_PX}
        handleLabels={{ expand: "Formular ausklappen", collapse: "Formular einklappen" }}
      >
        <form
          action={formAction}
          className="flex w-full flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain border-border px-6 pt-8 pb-8 md:max-w-sm md:border-r lg:max-w-md"
        >
          <div>
            <h1 className="text-display font-semibold">Strecke erstellen</h1>
            <p className="mt-1 text-sm text-muted">
              Setze nacheinander Wegpunkte auf der Karte — der Verlauf wird automatisch entlang
              echter Strassen berechnet. Öffentliche Strecken prüft ein Moderator, bevor sie
              sichtbar werden.
            </p>
          </div>

          <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Fortschritt">
            <StepLabel index={1} label="Verlauf" state={routeStepState} />
            <span className="h-px w-3 shrink-0 bg-border" aria-hidden="true" />
            <StepLabel index={2} label="Benennen" state={nameStepState} />
            <span className="h-px w-3 shrink-0 bg-border" aria-hidden="true" />
            <StepLabel index={3} label="Veröffentlichen" state={detailsStepState} />
          </ol>

          {/* Schritt 1: Route zeichnen — Rundfahrt wird vor dem Setzen der
              Punkte entschieden, weil sie beeinflusst, wie die Route auf der
              Karte geschlossen wird (letzter Punkt = erster Punkt). Start-/
              Zielort und Region werden serverseitig automatisch aus den
              gesetzten Punkten ermittelt (siehe proposeRoute()), müssen hier
              also nicht eingegeben werden. */}
          <div>
            <p className="mb-1.5 text-sm font-medium">Rundfahrt</p>
            <SegmentedControl
              label="Rundfahrt"
              wert={rundfahrt ? "ja" : "nein"}
              onChange={(w: "ja" | "nein") => setRundfahrt(w === "ja")}
              segmente={[
                { wert: "ja" as const, label: "Ja" },
                { wert: "nein" as const, label: "Nein" },
              ]}
            />
            <p className="mt-1 text-xs text-muted">
              {rundfahrt
                ? "Die Strecke endet automatisch wieder am Startpunkt."
                : "Die Strecke endet am zuletzt gesetzten Punkt."}
            </p>
          </div>

          {/* -my-2 hebt die 44 px der beiden Knöpfe wieder auf die Höhe
              der Textzeile zurück: die Tippfläche bleibt gross, die Zeile
              wächst nicht um 24 px. Diese Leiste sitzt über der Karte, auf
              der gerade Wegpunkte gesetzt werden — jeder Pixel, den sie
              nimmt, fehlt dort. */}
          <div className="-my-2 flex items-center gap-3 text-xs text-muted">
            <span>{mitAnzahl(waypoints.length, "Wegpunkt", "Wegpunkte")} gesetzt</span>
            {waypoints.length > 0 && (
              <button
                type="button"
                onClick={undoLast}
                className={textAktionClassName({ groesse: "xs" })}
              >
                Letzten entfernen
              </button>
            )}
            {waypoints.length > 0 && (
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                className={textAktionClassName({ groesse: "xs" })}
              >
                Zurücksetzen
              </button>
            )}
          </div>

          <ConfirmDialog
            open={resetConfirmOpen}
            title="Verlauf zurücksetzen"
            description="Alle gesetzten Wegpunkte werden entfernt — das lässt sich nicht rückgängig machen."
            confirmLabel="Zurücksetzen"
            variant="danger"
            onCancel={() => setResetConfirmOpen(false)}
            onConfirm={reset}
          />

          <p className="text-xs text-muted">
            {waypoints.length === 0 && "Klicke auf die Karte, um den Startpunkt zu setzen."}
            {waypoints.length === 1 && "Klicke weitere Punkte entlang der gewünschten Strecke."}
            {waypoints.length > 1 && routing && "Streckenverlauf wird berechnet…"}
            {waypoints.length > 1 && !routing && activeDirections && (
              <>Streckenverlauf gefunden: ca. {activeDirections.distanceKm.toFixed(1)} km</>
            )}
            {routingError && <span className="text-danger">{routingError}</span>}
          </p>

          {activeDirections && locationPreview && (
            <p className="text-xs text-muted">
              {locationPreview.startOrt === locationPreview.zielOrt
                ? `Start/Ziel: ${locationPreview.startOrt}`
                : `${locationPreview.startOrt} → ${locationPreview.zielOrt}`}
              {" · "}
              Region: {locationPreview.region}
            </p>
          )}

          <input
            type="hidden"
            name="geometry_geojson"
            value={
              activeDirections
                ? JSON.stringify({ type: "LineString", coordinates: activeDirections.coordinates })
                : ""
            }
          />
          <input
            type="hidden"
            name="tempolimits"
            value={activeDirections ? JSON.stringify(activeDirections.tempolimits) : "[]"}
          />
          <input
            type="hidden"
            name="laenge_km"
            value={activeDirections ? activeDirections.distanceKm.toFixed(1) : ""}
          />

          {/* Schritt 2: Benennen — erst sinnvoll, sobald eine Route existiert. */}
          {routeReady && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Name
              <Input
                name="name"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}

          {/* Schritt 3: Tags, Beschreibung, Sichtbarkeit — erst sinnvoll,
              sobald die Strecke einen Namen hat. */}
          {nameReady && (
            <>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Tags (optional)</legend>
                <div className="flex flex-wrap gap-2">
                  {KATEGORIEN.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => toggleTag(k.value)}
                      aria-pressed={tags.includes(k.value)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-fast ${
                        tags.includes(k.value)
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted hover:border-muted"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              {tags.map((t) => (
                <input key={t} type="hidden" name="kategorien" value={t} />
              ))}

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Beschreibung (optional)
                <Textarea name="charakter_text" rows={3} />
              </label>

              <Card surface className="flex flex-col gap-2 px-3 py-3 text-sm">
                {/* Dieselbe segmentierte Wahl wie im Fazit einer Fahrt
                    (RideSummaryForm) — vorher zwei eigene Fassungen mit
                    leicht verschiedenen Klassen für dieselbe Entscheidung. */}
                <SegmentedControl
                  label="Sichtbarkeit der Strecke"
                  wert={istPrivat ? "privat" : "oeffentlich"}
                  onChange={(w: "privat" | "oeffentlich") => setIstPrivat(w === "privat")}
                  segmente={[
                    {
                      wert: "privat" as const,
                      label: (
                        <>
                          <LockIcon className="h-4 w-4" />
                          Privat
                        </>
                      ),
                    },
                    {
                      wert: "oeffentlich" as const,
                      label: (
                        <>
                          <GlobeIcon className="h-4 w-4" />
                          Öffentlich
                        </>
                      ),
                    },
                  ]}
                />
                <p className="text-sm text-muted">
                  {istPrivat
                    ? "Nur für dich sichtbar, bis du sie selbst veröffentlichst."
                    : "Durchläuft die Moderation und wird danach öffentlich."}
                </p>
              </Card>
              <input type="hidden" name="ist_privat" value={istPrivat ? "true" : "false"} />

              {/* Sticky statt im normalen Fluss — bei ausgeklapptem Sheet
                  sonst je nach Bildschirmhöhe erst nach Scrollen erreichbar.

                  bottom-0 genügt inzwischen: das Sheet endet über der
                  fixierten BottomNav (bottom: var(--bottom-nav-h), siehe
                  DragSheet.tsx), der Knopf kann also nicht mehr unter ihr
                  landen. Vorher stand hier ein eigener Versatz von 3.75rem
                  als geschätzte Leistenhöhe — gemessen sind es 4rem, der
                  Knopf klebte also um 4px zu tief. Genau solche
                  Zweitschätzungen ersetzt der Token.

                  Ab md reserviert die Leiste den sicheren Bereich selbst —
                  sonst klebte der Knopf auf Geräten ohne Home-Taste direkt
                  auf der Geste-Leiste, siehe --safe-bottom in globals.css. */}
              <div className="sticky bottom-0 -mx-6 -mb-8 mt-2 border-t border-border bg-background px-6 pt-4 pb-4 md:pb-[calc(1rem+var(--safe-bottom))]">
                {state.error && (
                  <p role="alert" className="mb-3 text-sm text-danger">
                    {state.error}
                  </p>
                )}
                <Button type="submit" disabled={pending || !activeDirections} className="w-full">
                  {pending ? "Wird gespeichert…" : istPrivat ? "Privat speichern" : "Zur Prüfung einreichen"}
                </Button>
              </div>
            </>
          )}
        </form>
      </DragSheet>
    </main>
  );
}
