"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { textAktionClassName } from "@/components/ui/Button";
import { AutoIcon } from "@/components/NavIcons";
import PassFolgenButton from "@/components/PassFolgenButton";
import { STATUS_TON_TEXT, StatusPunkt } from "@/components/PassStatusZeile";
import { anzeigeFuerStatus } from "@/lib/passStatus";
import { offenSeitText } from "@/lib/passKalender";
import {
  fetchCongestionLevels,
  verkehrSamplesFuerLaenge,
  worstCongestion,
  type CongestionLevel,
} from "@/lib/traffic";
import {
  startzeitenSatz,
  type Startzeit,
  type VerkehrsPunkt,
} from "@/lib/ruhigeZeiten";
import {
  baueVerkehrseinschaetzung,
  jetztInZuerich,
  prognoseFuerStunde,
} from "@/lib/verkehrslage";
import { mitAnzahl } from "@/lib/format";
import type { PassKontext } from "@/lib/paesse";
import type { RouteGeoJSON } from "@/types/database";

// Der Losfahr-Check im Reiter Fahren: eine Frage, zwei Antworten, eine
// Fläche — ist der Pass offen, und wie ist der Verkehr. Er ersetzt
// PassSektion und VerkehrSektion, die dieselben Antworten auf je eine
// eigene Card mit Überschrift, Kalender-Klappe und Quellen-Zeile
// verteilten. Alles, was keine Losfahr-Entscheidung ist (Kalender,
// Meldungstext, Herkunft, Wochenraster), lebt auf der Passseite und im
// Details-Reiter — jede Zeile hier verlinkt dorthin.

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function FahrCheck({
  kontexte,
  feedStand,
  route,
  punkte,
  startzeiten,
  angemeldet,
}: {
  kontexte: PassKontext[];
  feedStand: string | null;
  route: RouteGeoJSON;
  punkte: VerkehrsPunkt[];
  startzeiten: Startzeit[];
  angemeldet: boolean;
}) {
  const coordinates = route.geometry_geojson.coordinates as [number, number][];
  const liveMoeglich = !!MAPBOX_TOKEN && coordinates.length >= 2;

  // Dieselbe Live-Abfrage wie die Hintergrundkarte (lib/traffic.ts) — mit
  // der Seite, weil das Widget im Reiter Fahren die Jetzt-Entscheidung
  // trägt (Muster aus VerkehrSektion).
  const [levels, setLevels] = useState<(CongestionLevel | null)[] | null>(null);

  useEffect(() => {
    if (!liveMoeglich) return;
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
  }, [route.id]);

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

  const einschaetzung = useMemo(
    () =>
      baueVerkehrseinschaetzung({
        live,
        prognoseFaktor,
        hatPrognose: punkte.length > 0,
        hatGemeinschaft: startzeitenSatz(startzeiten) !== null,
        liveLaedt: liveMoeglich && levels === null,
      }),
    [live, prognoseFaktor, punkte.length, startzeiten, liveMoeglich, levels],
  );

  // Die Verkehrszeile in beiden Fällen: mit Trennlinie unter den Pässen,
  // ohne als alleiniger Inhalt. Die Quellen stehen im title statt in einer
  // eigenen Zeile — wer sie sucht, findet sie; wer losfahren will, liest
  // sie nicht.
  function verkehrsZeile(mitTrennlinie: boolean) {
    return (
      <div
        className={`flex items-start gap-2 ${mitTrennlinie ? "border-t border-border pt-3" : ""}`}
        title={
          einschaetzung.quellen.length > 0
            ? `Quellen: ${einschaetzung.quellen.join(" · ")}`
            : undefined
        }
      >
        <AutoIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-medium">{einschaetzung.titel}</p>
          {einschaetzung.detail && (
            <p className="text-sm text-muted">{einschaetzung.detail}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section id="fahrcheck" aria-label="Aktuelle Lage" className="scroll-mt-6">
      <Card className="flex flex-col gap-3 px-4 py-3">
        {kontexte.length > 0 ? (
          <>
            {kontexte.map((kontext) => {
              const anzeige = anzeigeFuerStatus(
                kontext.status
                  ? {
                      zustand: kontext.status.zustand,
                      meldung: kontext.status.meldung,
                      quelle: kontext.status.quelle,
                      aktualisiertAm: kontext.status.aktualisiertAm,
                      manuellBis: kontext.status.manuellBis,
                    }
                  : null,
                feedStand,
              );
              const offenSeit = offenSeitText(
                anzeige.zustand,
                kontext.status?.seit ?? null,
                kontext.ereignisse,
              );
              return (
                <div key={kontext.pass.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={`/paesse#${kontext.pass.id}`}
                      className="truncate text-sm font-medium transition-colors duration-fast hover:text-accent"
                    >
                      {kontext.pass.name}
                    </Link>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-medium ${STATUS_TON_TEXT[anzeige.ton]}`}
                    >
                      <StatusPunkt ton={anzeige.ton} />
                      {anzeige.label}
                    </span>
                  </div>
                  {offenSeit && (
                    <span className="shrink-0 text-xs text-muted">{offenSeit}</span>
                  )}
                </div>
              );
            })}
            {verkehrsZeile(true)}
            <div className="flex items-center justify-between gap-3">
              {/* Ein Pass, ein Knopf. Bei mehreren Pässen führt der Weg zum
                  Folgen über die Passseite — ein Knopf je Zeile wäre im
                  Widget ein Fehlgriff-Cluster, und ein Knopf für den
                  falschen Pass wäre schlimmer als keiner. */}
              {kontexte.length === 1 ? (
                <PassFolgenButton
                  passId={kontexte[0].pass.id}
                  passName={kontexte[0].pass.name}
                  folgtMan={kontexte[0].folgtMan}
                  angemeldet={angemeldet}
                />
              ) : (
                <span className="text-sm text-muted">
                  {mitAnzahl(kontexte.length, "Pass", "Pässe")} auf dieser Strecke
                </span>
              )}
              <Link
                href={
                  kontexte.length === 1 ? `/paesse#${kontexte[0].pass.id}` : "/paesse"
                }
                className={textAktionClassName()}
              >
                Details →
              </Link>
            </div>
          </>
        ) : (
          verkehrsZeile(false)
        )}
      </Card>
    </section>
  );
}
