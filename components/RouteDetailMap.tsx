"use client";

import KartePlatzhalter from "@/components/ui/KartePlatzhalter";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Box } from "@/components/NavIcons";
import { type TrafficChipState } from "@/components/TrafficIndicator";
import { SPEED_LEGEND, tempolimitQuelle } from "@/lib/speed";
import {
  CONGESTION_META,
  fetchCongestionLevels,
  sliceRouteByTraffic,
  verkehrSamplesFuerLaenge,
  worstCongestion,
  type CongestionLevel,
} from "@/lib/traffic";
import type { RouteGeoJSON } from "@/types/database";
import { buttonVariants } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { segmentClassName, segmentHuelleClassName } from "@/components/ui/SegmentedControl";
import { useVolleGeometrie } from "@/components/VolleGeometrie";

// Siehe ExploreView.tsx für die Begründung des dynamischen Imports.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <KartePlatzhalter />,
});

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function RouteDetailMap({
  route: hereingereicht,
  bottomInsetPx = 0,
}: {
  // Auf der Streckenseite mit der Übersichtslinie (0117) — die volle Linie
  // kommt über useVolleGeometrie nach und ersetzt sie auf der Karte.
  route: RouteGeoJSON;
  // Von RouteDetailLayout gemeldet: wie viel der Karte das Detail-Sheet auf
  // Mobile gerade verdeckt. Nur durchgereicht — gebraucht wird der Wert in
  // RouteMap, wo der Kartenausschnitt berechnet wird.
  bottomInsetPx?: number;
}) {
  const { strecke: route, stand } = useVolleGeometrie(hereingereicht);
  // Verkehr wird erst abgefragt, wenn feststeht, auf welcher Linie: die
  // Stichproben liegen je Index (lib/traffic.ts, sampleIndices), und die
  // Übersichtslinie hat ihre Punkte woanders als die volle. Schlägt das
  // Nachladen fehl, gilt die Übersicht — Verkehr gibt es dann trotzdem.
  const linieSteht = stand !== "laedt";
  const [showSpeedLimits, setShowSpeedLimits] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const hasTempolimits = !!route.tempolimits?.length;
  // Herkunft ehrlich benennen statt nur Farben zu zeigen: dieselbe
  // Formulierung wie die öffentliche API (lib/speed.ts), damit Karte und
  // API nicht zwei Wahrheiten erzählen.
  const tempolimitHerkunft = route.tempolimits ? (tempolimitQuelle(route.tempolimits) ?? null) : null;
  // Die ODbL verlangt die Namensnennung überall, wo Werte aus
  // OpenStreetMap stehen — also nur, wenn diese Strecke welche trägt.
  const zeigtOsmTempolimits = !!route.tempolimits?.some((s) => s.quelle === "osm");

  const coordinates = route.geometry_geojson.coordinates as [number, number][];
  const unavailable = !MAPBOX_TOKEN || coordinates.length < 2;

  // Verkehrsabfrage der Hintergrundkarte (siehe lib/traffic.ts) — speist sowohl
  // den Verkehrs-Indikator (worstCongestion) als auch die eingefärbten
  // Kartenabschnitte (sliceRouteByTraffic), statt wie zuvor zwei unabhängige
  // Mechanismen zu pflegen. Das FahrCheck-Widget fragt für seine
  // Verkehrszeile selbst ab. Kein manueller Reset beim Streckenwechsel nötig:
  // die Seite rendert diese Komponente mit key={route.id} (siehe
  // app/strecken/[id]/page.tsx), ein Streckenwechsel montiert sie also neu.
  //
  // Die Stufen merken sich die Linie, auf der sie abgefragt wurden, damit
  // das Einfärben (sliceRouteByTraffic) dieselben Indizes schneidet.
  const [verkehr, setVerkehr] = useState<{
    levels: (CongestionLevel | null)[];
    linie: [number, number][];
  } | null>(null);
  const levels = verkehr?.levels ?? null;

  useEffect(() => {
    if (unavailable || !linieSteht) return;
    let cancelled = false;

    const sampleCount = verkehrSamplesFuerLaenge(route.laenge_km);
    const linie = coordinates;

    fetchCongestionLevels(linie, sampleCount, MAPBOX_TOKEN!).then((result) => {
      if (!cancelled) setVerkehr({ levels: result, linie });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id, linieSteht]);

  const trafficState: TrafficChipState = unavailable
    ? "none"
    : levels === null
      ? "loading"
      : (worstCongestion(levels.filter((l): l is CongestionLevel => l !== null)) ?? "none");

  // Stabile Referenz statt eines Inline-`[route]`: die Prop landet in der
  // Abhängigkeitsliste des Effekts, der in RouteMap den Kartenausschnitt auf
  // die Strecken legt (fitRoutes). Ein frisches Array bei jedem Render liess
  // ihn bei jedem Umschalten von Tempolimits/Verkehr/3D erneut laufen — die
  // Karte sprang dann auf den vollen Streckenausschnitt zurück und verwarf
  // jedes Hineinzoomen des Nutzers.
  const routesForMap = useMemo(() => [route], [route]);

  const trafficSegments = useMemo(() => {
    if (!verkehr) return [];
    return sliceRouteByTraffic(verkehr.linie, verkehr.levels)
      .filter((s): s is { coords: [number, number][]; level: CongestionLevel } => s.level !== null)
      .map((s) => ({ coords: s.coords, color: CONGESTION_META[s.level].color }));
  }, [verkehr]);

  return (
    // data-karten-rahmen / data-karten-ueberlagerung: RouteMap misst daran,
    // wie viel der Karte oben verdeckt ist, und passt die Strecke darunter
    // ein (verdeckteRaender in RouteMap.tsx).
    <div className="relative h-full w-full" data-karten-rahmen="">
      {/* Kein eigenes role="img": die Beschreibung trägt bereits die
          übergeordnete Seite, und darin sitzt der Navigationsschalter. */}
      <div className="h-full w-full">
        <RouteMap
          routes={routesForMap}
          showSpeedLimits={showSpeedLimits}
          showTraffic={showTraffic}
          show3D={show3D}
          trafficSegments={trafficSegments}
          bottomInsetPx={bottomInsetPx}
        />
      </div>
      <div
        className="absolute top-4 left-4 flex flex-col items-start gap-2"
        data-karten-ueberlagerung=""
      >
        {/* EINE EBENE ZUR ZEIT, UND SICHTBAR SO. Vorher waren Tempolimits und
            Verkehr zwei unabhängig aussehende Umschalter, die einander still
            ausgeschaltet haben: wer den zweiten einschaltete, sah den ersten
            zurückspringen und las das als Fehler. Beide zugleich geht nicht —
            sie färben dieselbe Linie —, also steht die Ausschliesslichkeit
            jetzt als Auswahl da statt als Überraschung.

            Der Verkehrszustand (Frei/Mässig/Stau) bleibt am Eintrag, solange
            es Daten gibt; ohne Daten ist er gesperrt statt weg — eine Ebene,
            die verschwindet, sobald der Dienst schweigt, ist schwerer zu
            verstehen als eine, die "keine Daten" sagt. */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Kartenebene" className={segmentHuelleClassName("bg-background")}>
            <button
              type="button"
              role="radio"
              aria-checked={!showSpeedLimits && !showTraffic}
              onClick={() => {
                setShowSpeedLimits(false);
                setShowTraffic(false);
              }}
              className={segmentClassName(!showSpeedLimits && !showTraffic)}
            >
              {/* "Standard" statt "Keine": die Karte zeigt ja weiterhin die
                  Strecke, nur ohne eingefärbte Zusatzebene. */}
              Standard
            </button>
            {hasTempolimits && (
              <button
                type="button"
                role="radio"
                aria-checked={showSpeedLimits}
                onClick={() => {
                  setShowSpeedLimits(true);
                  setShowTraffic(false);
                }}
                className={segmentClassName(showSpeedLimits)}
              >
                Tempolimits
              </button>
            )}
            <button
              type="button"
              role="radio"
              aria-checked={showTraffic}
              disabled={trafficState === "loading" || trafficState === "none"}
              title={
                trafficState === "loading"
                  ? "Verkehr wird geladen…"
                  : trafficState === "none"
                    ? "Keine Live-Verkehrsdaten für diese Strecke"
                    : undefined
              }
              onClick={() => {
                setShowTraffic(true);
                setShowSpeedLimits(false);
              }}
              className={segmentClassName(showTraffic, "disabled:opacity-40")}
            >
              {trafficState !== "loading" && trafficState !== "none" && (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: CONGESTION_META[trafficState].color }}
                />
              )}
              Verkehr
            </button>
          </div>
          <button
            onClick={() => setShow3D((v) => !v)}
            aria-pressed={show3D}
            // Feste Beschriftung, der Zustand liegt in aria-pressed und in der
            // Akzentfüllung. "2D-Ansicht" als Text eines gedrückten Knopfes
            // las sich als "2D-Ansicht, gedrückt" — also das Gegenteil.
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: show3D ? "border-accent bg-accent-subtle text-accent-ink" : "bg-background",
            })}
          >
            <Box className="h-3.5 w-3.5" aria-hidden="true" />
            3D-Ansicht
          </button>
        </div>
        {showSpeedLimits && (
          <Card elevated className="flex flex-col gap-1 px-3 py-2 text-xs text-foreground">
            {SPEED_LEGEND.map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <span className="h-0.5 w-4" style={{ backgroundColor: l.color }} />
                {l.label}
              </div>
            ))}
            {zeigtOsmTempolimits && (
              <p className="mt-1 max-w-40 text-[0.6875rem] leading-tight text-muted-foreground">
                Teils © OpenStreetMap-Mitwirkende (ODbL)
              </p>
            )}
            {tempolimitHerkunft && (
              <p className="mt-1 max-w-40 text-[0.6875rem] leading-tight text-muted-foreground">
                {tempolimitHerkunft}
              </p>
            )}
          </Card>
        )}
        {showTraffic && trafficSegments.length > 0 && (
          <Card elevated className="flex flex-col gap-1 px-3 py-2 text-xs text-foreground">
            {Object.values(CONGESTION_META).map((meta) => (
              <div key={meta.label} className="flex items-center gap-2">
                <span className="h-0.5 w-4" style={{ backgroundColor: meta.color }} />
                {meta.label}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
