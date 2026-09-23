"use client";

import { useEffect, useMemo, useState } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import Card from "@/components/ui/Card";
import { AutoIcon } from "@/components/NavIcons";
import {
  fetchCongestionLevels,
  verkehrSamplesFuerLaenge,
  worstCongestion,
  type CongestionLevel,
} from "@/lib/traffic";
import {
  skalaFuerPunkte,
  startzeitenSatz,
  type Startzeit,
  type VerkehrsPunkt,
} from "@/lib/ruhigeZeiten";
import {
  baueVerkehrseinschaetzung,
  jetztInZuerich,
  prognoseFuerStunde,
} from "@/lib/verkehrslage";
import type { RouteGeoJSON } from "@/types/database";
import { useVolleGeometrie } from "@/components/VolleGeometrie";

// Der Verkehrsblock im Reiter Fahren — nur für Strecken ohne Pass. Mit
// Pass trägt die Pass-Sektion die Entscheidung ("kann ich los?"); ohne
// Pass gab es bisher nur die Wochenprognose weiter unten und den Live-Chip
// auf der Hintergrundkarte. Diese Sektion führt beides in einer
// Jetzt-Einschätzung zusammen.
//
// Bewusst ohne eigene Karte: der Verkehrsfluss liegt bereits als Ebene auf
// der grossen Hintergrundkarte (RouteDetailMap, Umschalter "Verkehr") —
// eine zweite, kleinere Karte mit denselben Farben wäre nur die Dublette.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function VerkehrSektion({
  route: hereingereicht,
  punkte,
  startzeiten,
}: {
  route: RouteGeoJSON;
  punkte: VerkehrsPunkt[];
  startzeiten: Startzeit[];
}) {
  // Die Stichproben liegen je Index (lib/traffic.ts) — auf der vollen Linie
  // wie vor 2026-09-23, deshalb wird auf sie gewartet (sie lädt ohnehin für
  // die Detailkarte, derselbe Abruf). Scheitert sie, gilt die Übersicht.
  const { strecke: route, stand } = useVolleGeometrie(hereingereicht);
  const linieSteht = stand !== "laedt";
  const coordinates = route.geometry_geojson.coordinates as [number, number][];
  const liveMoeglich = !!MAPBOX_TOKEN && coordinates.length >= 2;

  // Dieselbe Live-Abfrage wie die Hintergrundkarte (lib/traffic.ts) — mit
  // der Seite, nicht erst beim Öffnen eines Reiters: die Sektion steht im
  // Reiter Fahren und trägt dort die Jetzt-Entscheidung.
  const [levels, setLevels] = useState<(CongestionLevel | null)[] | null>(null);

  useEffect(() => {
    if (!liveMoeglich || !linieSteht) return;
    let abgebrochen = false;
    fetchCongestionLevels(
      coordinates,
      verkehrSamplesFuerLaenge(route.laenge_km),
      MAPBOX_TOKEN!,
    ).then((ergebnis) => {
      if (!abgebrochen) setLevels(ergebnis);
    });
    return () => {
      abgebrochen = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id, linieSteht]);

  const live = useMemo(
    () =>
      worstCongestion(
        (levels ?? []).filter((l): l is CongestionLevel => l !== null),
      ),
    [levels],
  );

  // Die Stunde ist eine Aussage über jetzt — einmal je Mount, nicht je
  // Render: um Mitternacht kippt sie ohnehin mit dem nächsten Öffnen.
  const { wochentag, stunde } = useMemo(() => jetztInZuerich(), []);
  const prognoseFaktor = useMemo(
    () => prognoseFuerStunde(punkte, wochentag, stunde),
    [punkte, wochentag, stunde],
  );

  const skala = useMemo(() => skalaFuerPunkte(punkte), [punkte]);

  const einschaetzung = useMemo(
    () =>
      baueVerkehrseinschaetzung({
        live,
        prognoseFaktor,
        skala,
        hatPrognose: punkte.length > 0,
        hatGemeinschaft: startzeitenSatz(startzeiten) !== null,
        liveLaedt: liveMoeglich && levels === null,
      }),
    [live, prognoseFaktor, skala, punkte.length, startzeiten, liveMoeglich, levels],
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading icon={AutoIcon}>Verkehr</SectionHeading>

      <Card className="px-4 py-3">
        <p className="text-sm font-medium">{einschaetzung.titel}</p>
        {einschaetzung.detail && (
          <p className="mt-1 text-sm text-muted">{einschaetzung.detail}</p>
        )}
        {einschaetzung.quellen.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            Quellen: {einschaetzung.quellen.join(" · ")}
          </p>
        )}
      </Card>
    </section>
  );
}
