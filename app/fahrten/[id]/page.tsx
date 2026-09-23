import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OG_GEERBT } from "@/lib/openGraph";
import Link from "next/link";
import {
  Bike,
  Car,
  Clock,
  Flame,
  Gauge,
  MapPin,
  Mountain,
  Ruler,
} from "@/components/NavIcons";
import Header from "@/components/Header";
import Avatar from "@/components/Avatar";
import KudosButton from "@/components/KudosButton";
import ShareRideButton from "@/components/ShareRideButton";
import CompletionActionsMenu from "@/components/CompletionActionsMenu";
import CompletionReportButton from "@/components/CompletionReportButton";
import FahrtProfilUmschalter from "@/components/FahrtProfilUmschalter";
import { stimmigerSchnitt, tempoAbschnitte } from "@/lib/tempoprofil";
import CompletionMap from "@/components/CompletionMap";
import CompletionPhotoGallery from "@/components/CompletionPhotoGallery";
import DetectedSegmentsCard from "@/components/DetectedSegmentsCard";
import { freieFahrtTitel, getCompletionDetail, getDetectedSegments } from "@/lib/completions";
import { getRoute } from "@/lib/routes";
import { getKudosForCompletions } from "@/lib/kudos";
import { featuredMilestone, getUserAchievementStats } from "@/lib/achievements";
import { getCurrentUser } from "@/lib/supabase/server";
import { formatDauer, formatMeter } from "@/lib/format";
import VerifiziertAbzeichen from "@/components/VerifiziertAbzeichen";
import { publicationBlockReason } from "@/lib/track";
import { erkannteFahrtrichtung } from "@/lib/richtung";
import Card from "@/components/ui/Card";
import Kennzahl, { Kennzahlen } from "@/components/ui/Kennzahl";
import MotorklasseBadge from "@/components/MotorklasseBadge";
import { motorklasseLabel } from "@/lib/motorklassen";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import AbschnittTabs from "@/components/ui/AbschnittTabs";
import { textAktionClassName } from "@/components/ui/Button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const completion = await getCompletionDetail(id, user?.id ?? null);
  if (!completion) return { title: "Fahrt – Strado" };

  const fahrer = completion.displayName ?? "Fahrer";

  // Ohne description bestimmt der Crawler das Snippet aus beliebigem
  // Seitentext — bei einer Fahrtseite landet dort im Zweifel
  // "Kudos geben · Melden · Löschen". Die Kennzahlen stehen ohnehin schon
  // geladen bereit.
  const kennzahlen = [
    completion.distanzKm != null ? `${completion.distanzKm.toFixed(0)} km` : null,
    completion.dauerSekunden ? formatDauer(completion.dauerSekunden) : null,
  ]
    .filter(Boolean)
    .join(" in ");

  // openGraph.description muss ausdrücklich mit: Next übernimmt die
  // description NICHT automatisch in den openGraph-Block, sobald dieser
  // eigene Felder setzt. Ohne sie fällt die Vorschau in WhatsApp,
  // Signal, Slack & Co. auf den Seitentext zurück — dieselbe
  // "Kudos geben · Melden"-Zeile, gegen die die description oben steht,
  // und ausgerechnet dort, wo eine Fahrt am ehesten geteilt wird.
  if (completion.art === "frei") {
    const titel = freieFahrtTitel(completion.titel, completion.startOrt);
    const beschreibung = kennzahlen
      ? `${fahrer} ist ${kennzahlen} gefahren — ${titel}. Auf Strado ansehen.`
      : `Freie Fahrt von ${fahrer} auf Strado.`;
    return {
      title: `${titel} – Fahrt von ${fahrer} – Strado`,
      description: beschreibung,
      openGraph: {
        ...OG_GEERBT,
        type: "article",
        title: `${titel} – Fahrt von ${fahrer}`,
        description: beschreibung,
      },
      // Kanonische Adresse. Eine Fahrt ist die am häufigsten geteilte
      // Adresse der App (Teilen-Knopf, lib/shareImage.ts), landet also in
      // Chats und Bios — oft mit angehängten Parametern. Der Inhalt bleibt
      // derselbe.
      alternates: { canonical: `/fahrten/${id}` },
    };
  }

  const route = completion.routeId ? await getRoute(completion.routeId) : null;
  if (!route) return { title: "Fahrt – Strado" };

  const beschreibung = kennzahlen
    ? `${fahrer} ist ${kennzahlen} auf der Strecke ${route.name} gefahren. Auf Strado ansehen.`
    : `Fahrt von ${fahrer} auf der Strecke ${route.name}. Auf Strado ansehen.`;

  return {
    title: `${route.name} – Fahrt von ${fahrer} – Strado`,
    description: beschreibung,
    openGraph: {
      ...OG_GEERBT,
      type: "article",
      title: `${route.name} – Fahrt von ${fahrer}`,
      description: beschreibung,
    },
    // Kanonische Adresse. Eine Fahrt ist die am häufigsten geteilte
    // Adresse der App (Teilen-Knopf, lib/shareImage.ts), landet also in
    // Chats und Bios — oft mit angehängten Parametern. Der Inhalt bleibt
    // derselbe.
    alternates: { canonical: `/fahrten/${id}` },
  };
}

// Custom Detailseite pro Aufzeichnung (Strava-artig: Strecke + Stats +
// Kudos auf einer eigenen, teilbaren URL) statt nur als Listenzeile im
// Profil sichtbar. Zugriff: öffentliche Fahrten sind für jeden Betrachter
// (auch anonym) offen, private nur für den Besitzer selbst — siehe
// getCompletionDetail (lib/completions.ts) für die zwei Zugriffspfade.
//
// Seit 0044_freie_fahrten.sql zwei Ausprägungen: eine Streckenfahrt zeigt
// Strecke, Deckungsgrad und Streckenhöhenprofil, eine freie Fahrt den
// aufgezeichneten Track, ihren Ortsbezug und den summierten Anstieg.
export default async function FahrtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const completion = await getCompletionDetail(id, user?.id ?? null);
  if (!completion) notFound();

  const istFreieFahrt = completion.art === "frei";

  // Die folgenden vier Abfragen hängen alle nur an completion, nicht
  // voneinander — parallel statt nacheinander gestartet (gleiches Muster
  // wie app/strecken/[id]/page.tsx), spart auf dieser Seite einen
  // entsprechend langen Round-Trip-Wasserfall.
  const [route, kudosByCompletion, detectedSegments, achievementStats] = await Promise.all([
    completion.routeId ? getRoute(completion.routeId) : Promise.resolve(null),
    completion.istOeffentlich
      ? getKudosForCompletions([completion.id], user?.id ?? null)
      : Promise.resolve(null),
    // Nur für den Besitzer einer freien Fahrt: innerhalb dieser Aufzeichnung
    // automatisch erkannte Streckenabschnitte (siehe lib/lapDetection.ts).
    // Bewusst nicht für fremde Betrachter geladen — die Verknüpfung ist kein
    // Teil der öffentlichen Views (public_fahrten & Co.), siehe
    // getDetectedSegments.
    completion.isOwner && istFreieFahrt && user
      ? getDetectedSegments(completion.id, user.id)
      : Promise.resolve([]),
    // Nur für den Besitzer geladen — die Meilensteine sind seine eigenen
    // Gesamtzahlen, nicht die dieser einzelnen Fahrt, und für einen fremden
    // Betrachter irrelevant (spart die zusätzliche Query in dem Fall).
    completion.isOwner ? getUserAchievementStats(completion.userId) : Promise.resolve(null),
  ]);

  // Eine Streckenfahrt ohne auffindbare Strecke gibt es nicht — eine freie
  // Fahrt dagegen hat per Definition keine.
  if (!istFreieFahrt && !route) notFound();

  const kudos = kudosByCompletion?.get(completion.id) ?? null;
  const milestoneLabel = achievementStats ? featuredMilestone(achievementStats) : null;

  // Bei einer freien Fahrt zählt die Bewegtzeit — eine Ausfahrt mit
  // Kaffeestopp hätte über die verstrichene Zeit ein sinnlos niedriges
  // Durchschnittstempo. Bei einer Streckenfahrt bleibt es bei der
  // verstrichenen Zeit, die auch die Bestenliste verwendet.
  const tempoSekunden = istFreieFahrt
    ? (completion.bewegteZeitSekunden ?? completion.dauerSekunden)
    : completion.dauerSekunden;
  // stimmigerSchnitt: ein Durchschnitt über dem Höchsttempo des eigenen
  // Profils widerlegt sich selbst und wird nicht gezeigt (lib/tempoprofil.ts).
  //
  // Hat der Fahrer das Tempo verborgen (profiles.zeigt_tempo, 0125), rechnet
  // die Seite für fremde Betrachter gar nicht erst einen Schnitt aus.
  const rohSchnittKmh =
    tempoSekunden && tempoSekunden > 0 && completion.distanzKm
      ? completion.distanzKm / (tempoSekunden / 3600)
      : null;
  const avgKmh = !completion.zeigtTempo ? null : stimmigerSchnitt(
    rohSchnittKmh,
    completion.tempoprofil,
  );

  // Nur zeigen, wenn sich die beiden Zeiten spürbar unterscheiden — sonst
  // steht dieselbe Zahl zweimal da.
  const zeigtBewegtzeit =
    completion.bewegteZeitSekunden !== null &&
    completion.dauerSekunden !== null &&
    completion.dauerSekunden - completion.bewegteZeitSekunden > 60;

  const hoehenprofil = istFreieFahrt ? completion.hoehenprofil : (route?.hoehenprofil ?? null);
  // Routenprofile sind immer vermessen (swisstopo swissALTI3D,
  // lib/actions/routes.ts) — nur freie Fahrten tragen ihre gespeicherte
  // Quelle (0120), Bestand ohne Quelle rendert keine Zeile.
  const hoehenQuelle = istFreieFahrt ? completion.hoehenQuelle : "swisstopo";
  const VehicleIcon = completion.vehicle?.typ === "motorrad" ? Bike : Car;

  // Tempo-Einfärbung der eigenen Spur (0115): nur für den Besitzer, nur wenn
  // das Profil beim Speichern berechnet wurde — ältere Fahrten und fremde
  // Betrachter sehen die bisherige Darstellung. Bei Streckenfahrten tritt
  // die eigene Spur an die Stelle der Streckengeometrie: Das Tempo hängt an
  // den gefahrenen Punkten, nicht an der Soll-Linie.
  const tempoSegmente =
    completion.isOwner && completion.tempoprofil && completion.track
      ? tempoAbschnitte(
          completion.track.coordinates as [number, number][],
          completion.tempoprofil,
        )
      : null;
  const hatEigenesTempo = tempoSegmente !== null && tempoSegmente.length > 0;
  const kartenRoute = !istFreieFahrt && !hatEigenesTempo ? route : null;

  // Die gewertete Klasse sieht nur der Fahrer selbst (siehe CompletionDetail).
  // Sie hängt bewusst NICHT am Fahrzeug: fahrzeug_id ist `on delete set null`,
  // die Klasse an der Fahrt bleibt beim Löschen des Fahrzeugs aber stehen
  // (Trigger aus 0080). Eine Fahrt ohne Fahrzeug kann also sehr wohl eine
  // Klasse tragen — und dann gehört sie angezeigt, sonst verschwindet für den
  // Fahrer die Information, in welcher Rangliste seine Zeit steht.
  const gewerteteKlasse = completion.isOwner ? completion.motorklasseGewertet : null;

  // Diskrete Fahrtrichtung (keine Wertung, nur Anzeige): Bei einer
  // Punkt-zu-Punkt-Strecke steht hier, von wo aus gefahren wurde — die
  // offizielle Zeile darunter nennt immer Start → Ziel, egal wie herum
  // gefahren wurde. Rundfahrten und freie Fahrten bleiben unverändert.
  const trackStart = completion.track?.coordinates?.[0] ?? null;
  const fahrtrichtung =
    !istFreieFahrt && route && trackStart
      ? erkannteFahrtrichtung(
          trackStart as [number, number],
          route.start_geojson.coordinates as [number, number],
          route.ziel_geojson.coordinates as [number, number],
          route.ist_rundfahrt,
        )
      : null;
  const gefahrenAb =
    fahrtrichtung === "zurueck" ? route?.ziel_ort ?? null : fahrtrichtung === "hin" ? (route?.start_ort ?? null) : null;

  return (
    <div className="flex h-dvh flex-col">
      <Header back={completion.isOwner ? "/profil" : `/fahrer/${completion.userId}`} />
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen>
          <div className="flex items-center gap-3">
            <Link
              href={completion.isOwner ? "/profil" : `/fahrer/${completion.userId}`}
              className="group flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar url={completion.avatarUrl} name={completion.displayName} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium transition-colors duration-fast group-hover:text-accent">
                  {completion.isOwner ? "Deine Fahrt" : (completion.displayName ?? "Fahrer")}
                </p>
                <p className="text-xs text-muted">
                  {new Date(completion.datum).toLocaleDateString("de-CH", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              {!completion.isOwner && user && (
                <KudosButton
                  completionId={completion.id}
                  initialCount={kudos?.count ?? 0}
                  initialGiven={kudos?.givenByMe ?? false}
                />
              )}
              {/* Der Owner kann keine eigenen Kudos geben — aber die Zahl
                  gehört ihm: vorher sah er auf der eigenen Fahrt gar keine,
                  während Fremde Button plus Stand sahen. Reine Anzeige,
                  gleiche Stelle, gleiche Flamme. Nur öffentlich: private
                  Fahrten bekommen keine Kudos. */}
              {completion.isOwner && completion.istOeffentlich && (
                <span
                  className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-medium text-muted"
                  title="So viele Kudos hat diese Fahrt erhalten"
                >
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="tabular-nums">{kudos?.count ?? 0}</span>
                  <span className="sr-only">Kudos erhalten</span>
                </span>
              )}
              {/* Eine freie Fahrt kann nur geteilt werden, wenn sie selbst
                  öffentlich ist — nur dann existiert der gekappte Track, aus
                  dem das Bild seine Linie zeichnet. Streckenfahrten nehmen
                  wie bisher die Streckengeometrie. */}
              {(route || (istFreieFahrt && completion.istOeffentlich && completion.track)) && (
                <ShareRideButton
                  routeId={route?.id ?? null}
                  completionId={completion.id}
                  title={istFreieFahrt ? freieFahrtTitel(completion.titel, completion.startOrt) : (route?.name ?? "")}
                  region={completion.region ?? route?.region ?? null}
                  elevationM={istFreieFahrt ? completion.hoehenmeterAufstieg : (route?.hoehe_m ?? null)}
                  distanceKm={completion.distanzKm ?? route?.laenge_km ?? 0}
                  durationSeconds={completion.dauerSekunden}
                  date={completion.datum}
                  milestoneLabel={milestoneLabel}
                  // Eine private Fahrt sieht nur ihr Besitzer — wer dem Link
                  // aus dem geteilten Bild folgt, liefe ins Leere. Dann
                  // verweist das Bild auf die Strecke selbst.
                  shareUrl={
                    completion.istOeffentlich || !route
                      ? `/fahrten/${completion.id}`
                      : `/strecken/${route.id}`
                  }
                />
              )}
              {/* Melden nur für andere und nur bei einer geteilten Fahrt —
                  private Fahrten sieht ohnehin niemand sonst. */}
              {!completion.isOwner && user && completion.istOeffentlich && (
                <CompletionReportButton completionId={completion.id} />
              )}
              {completion.isOwner && (
                <CompletionActionsMenu
                  completionId={completion.id}
                  isPublic={completion.istOeffentlich}
                  coveragePercent={completion.abdeckungProzent}
                  blockedReason={
                    istFreieFahrt
                      ? publicationBlockReason(
                          completion.distanzKm ?? 0,
                          completion.bewegteZeitSekunden ?? completion.dauerSekunden ?? 0,
                        )
                      : null
                  }
                  notiz={completion.notiz}
                />
              )}
            </div>
          </div>

          <div>
            <p className="text-sm text-muted">{istFreieFahrt ? completion.region : route!.region}</p>
            {istFreieFahrt ? (
              <h1 className="text-display font-semibold tracking-tight">
                {freieFahrtTitel(completion.titel, completion.startOrt)}
              </h1>
            ) : (
              <Link
                href={`/strecken/${route!.id}`}
                className="group inline-flex items-baseline gap-1.5"
              >
                <h1 className="text-display font-semibold tracking-tight group-hover:text-accent">
                  {route!.name}
                </h1>
              </Link>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              {istFreieFahrt ? (
                completion.startOrt && (
                  <>
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    Start: {completion.startOrt}
                  </>
                )
              ) : route!.ist_rundfahrt ? (
                `Start/Ziel: ${route!.start_ort}`
              ) : (
                `${route!.start_ort} → ${route!.ziel_ort}${gefahrenAb ? ` · ab ${gefahrenAb}` : ""}`
              )}
            </p>
            {/* Rückverweis nur für den Besitzer, nur bei einer automatisch
                erkannten Streckenfahrt (siehe lib/lapDetection.ts) — die
                Verknüpfung ist bewusst nicht Teil der öffentlichen Views,
                siehe CompletionDetail.parentCompletionId. */}
            {completion.isOwner && completion.parentCompletionId && (
              <Link
                href={`/fahrten/${completion.parentCompletionId}`}
                className={textAktionClassName()}
              >
                Teil einer längeren Fahrt — ansehen →
              </Link>
            )}
          </div>

          {/* Reiter statt Stapel: Übersicht (Geschichte) und Details
              (Kleingedrucktes) nebeneinander. */}
          <AbschnittTabs tabs={[{ titel: "Übersicht" }, { titel: "Details" }]}>
          <div className="flex flex-col gap-5">
          {/* Das Ergebnis zuerst: die auf dieser Fahrt erkannten Strecken
              samt Zeit standen im Reiter "Details" unter Fahrzeug und
              Abdeckung — also das, weswegen man die Fahrt öffnet, hinter dem
              Kleingedruckten. Nur für den Besitzer (getDetectedSegments). */}
          {detectedSegments.length > 0 && <DetectedSegmentsCard segments={detectedSegments} />}

          {/* Karte + Profil als eine Visualisierung: ein Rahmen, ein Gedanke.
              Vorher zwei gleich grosse Blöcke mit eigenem Gewicht plus
              erklärender Kleinstzeile dazwischen. */}
          <Card className="overflow-hidden">
            <div className="h-64 sm:h-80">
              <CompletionMap route={kartenRoute} track={completion.track} tempoSegmente={tempoSegmente} />
            </div>
            <div className="border-t border-border px-4 py-3">
              <FahrtProfilUmschalter
                hoehenprofil={hoehenprofil}
                hoehenQuelle={hoehenQuelle}
                tempoprofil={completion.isOwner ? completion.tempoprofil : null}
                schnittKmh={avgKmh}
              />
              {hatEigenesTempo && (
                <p className="pt-2 text-xs text-muted">
                  Linie nach deinem gefahrenen Tempo eingefärbt — nur für dich sichtbar.
                </p>
              )}
            </div>
          </Card>

          {/* Die Kennzahlen direkt unter der Karte. Sie standen nach
              Fahrzeug, Abdeckung, Notiz und Fotos — auf dem Telefon also
              zwei Bildschirmhöhen tief, obwohl sie die Frage beantworten, mit
              der man eine Fahrt öffnet: wie weit, wie lang, wie schnell. */}
          {/* Vier Kennzahlen, eine Betonungsstufe. Vorher trugen Distanz
              und Zeit text-title/600 und die beiden daneben nur font-mono —
              gleiche Rolle, zwei Grössen, und zwar an jeder der drei
              Stellen, die dieses Raster von Hand nachbauten, leicht anders.
              Siehe docs/design-vereinfachung.md, Anhang A2. */}
          <Kennzahlen>
            <Kennzahl
              beschriftung={
                <>
                  <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                  Distanz
                </>
              }
              wert={`${(completion.distanzKm ?? route?.laenge_km ?? 0).toFixed(1)} km`}
            />
            <Kennzahl
              beschriftung={
                <>
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  Zeit
                </>
              }
              wert={
                completion.dauerSekunden !== null ? formatDauer(completion.dauerSekunden) : "—"
              }
              zusatz={
                zeigtBewegtzeit
                  ? `${formatDauer(completion.bewegteZeitSekunden!)} in Bewegung`
                  : undefined
              }
              // Steht bewusst in der Zeit-Kachel und nicht im Seitenkopf: die
              // Verifikation betrifft genau diese eine Zahl und keine andere.
              // Distanz, Höhenmeter und Abdeckung sind serverseitig
              // abgesichert (0052/0059/0074/0078) und brauchen kein Abzeichen.
              fuss={
                completion.dauerSekunden !== null ? (
                  <VerifiziertAbzeichen quelle={completion.dauerQuelle} />
                ) : undefined
              }
            />
            <Kennzahl
              beschriftung={
                <>
                  <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                  Ø Tempo
                </>
              }
              wert={avgKmh !== null ? `${avgKmh.toFixed(0)} km/h` : "—"}
              // Die Kachel bleibt stehen, damit das Raster nicht springt; der
              // Zusatz sagt, warum dort nichts steht, statt eine fehlende
              // Messung vorzutäuschen.
              // Zwei Gründe für den Strich, beide ausgesprochen: verborgen
              // (0125) oder von stimmigerSchnitt verworfen, weil die Zeit nicht
              // zum eigenen Tempoprofil passt — vorher stand dann ein Strich
              // ohne jede Erklärung (Re-Audit 2026-09-23).
              zusatz={
                !completion.zeigtTempo
                  ? "Vom Fahrer verborgen"
                  : rohSchnittKmh !== null && avgKmh === null
                    ? "Zeitmessung unvollständig"
                    : undefined
              }
            />
            <Kennzahl
              beschriftung={
                <>
                  <Mountain className="h-3.5 w-3.5" aria-hidden="true" />
                  {istFreieFahrt ? "Aufstieg" : "Höchster Punkt"}
                </>
              }
              wert={
                istFreieFahrt
                  ? completion.hoehenmeterAufstieg !== null
                    ? formatMeter(completion.hoehenmeterAufstieg)
                    : "—"
                  : route!.hoehe_m !== null
                    ? formatMeter(route!.hoehe_m)
                    : "—"
              }
            />
          </Kennzahlen>

          {/* Reiter Übersicht: die Geschichte — Karte, Zahlen, Notiz, Bilder.
              Reiter Details: das Kleingedruckte — Fahrzeug, Abdeckung,
              erkannte Abschnitte. */}
          {completion.notiz && (
            <blockquote className="border-l-2 border-accent pl-4 text-base leading-relaxed text-foreground">
              {completion.notiz}
            </blockquote>
          )}

          <CompletionPhotoGallery
            photos={completion.photos}
            canRemove={completion.isOwner}
            displayName={completion.displayName}
          />

          </div>
          <div className="flex flex-col gap-5">
          {/* Entflochten: Fahrzeug, Abdeckung und Notiz waren eine Karte mit
              vier Gedanken. Jetzt: Fahrzeug als stille Zeile, Abdeckung als
              schmaler Fortschritt, Notiz als Zitat — drei Stimmen statt einer. */}
          {(completion.vehicle || gewerteteKlasse !== null) && (
            <div className="flex items-center gap-3">
              {completion.vehicle && (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
                  <VehicleIcon className="h-5 w-5 text-muted" aria-hidden="true" />
                </span>
              )}
              <div className="flex min-w-0 flex-col gap-1">
                {completion.vehicle && (
                  <p className="text-sm font-medium text-foreground">
                    {completion.vehicle.marke} {completion.vehicle.modell}
                  </p>
                )}
                {gewerteteKlasse !== null && <MotorklasseBadge klasse={gewerteteKlasse} />}
              </div>
            </div>
          )}
          {gewerteteKlasse !== null &&
            completion.motorklasse !== null &&
            gewerteteKlasse !== completion.motorklasse && (
              <p className="text-sm leading-relaxed text-muted">
                Angegeben war{" "}
                <span className="font-medium text-foreground">
                  {motorklasseLabel(completion.motorklasse)}
                </span>
                . Diese Fahrt hat mehr Motorleistung verlangt, als diese Klasse hergibt, und
                wird deshalb in{" "}
                <span className="font-medium text-foreground">
                  {motorklasseLabel(gewerteteKlasse)}
                </span>{" "}
                gewertet. Wenn das nicht stimmt, liegt es meist an der Leistungsangabe des
                Fahrzeugs — trag das Fahrzeug mit dem richtigen Wert neu ein.
              </p>
            )}
          {completion.abdeckungProzent !== null && (
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(100, Math.max(0, completion.abdeckungProzent))}%` }}
                />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {completion.abdeckungProzent}% der Strecke
              </span>
            </div>
          )}
          </div>
          </AbschnittTabs>

          {/* Weiter statt Sackgasse: Wer über einen geteilten Link auf dieser
              Seite landet, hat sonst keinen Weg zu Strecke, Feed oder nächster
              Fahrt. Zwei Text-Handlungen, kein neuer Baustein. */}
          <nav aria-label="Weiter" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4">
            {!istFreieFahrt && route ? (
              <Link href={`/strecken/${route.id}`} className={textAktionClassName()}>
                Strecke ansehen →
              </Link>
            ) : (
              <Link href="/" className={textAktionClassName()}>
                Strecken entdecken →
              </Link>
            )}
            <Link href="/feed" className={textAktionClassName()}>
              Weitere Fahrten im Feed →
            </Link>
          </nav>
        </Seitenrahmen>
      </div>
    </div>
  );
}
