import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Bike,
  Car,
  Clock,
  Gauge,
  MapPin,
  Mountain,
  Route as RouteIcon,
  Ruler,
} from "lucide-react";
import Header from "@/components/Header";
import Avatar from "@/components/Avatar";
import KudosButton from "@/components/KudosButton";
import ShareRideButton from "@/components/ShareRideButton";
import CompletionActionsMenu from "@/components/CompletionActionsMenu";
import CompletionReportButton from "@/components/CompletionReportButton";
import ElevationProfile from "@/components/ElevationProfile";
import CompletionMap from "@/components/CompletionMap";
import CompletionPhotoGallery from "@/components/CompletionPhotoGallery";
import DetectedSegmentsCard from "@/components/DetectedSegmentsCard";
import { freieFahrtTitel, getCompletionDetail, getDetectedSegments } from "@/lib/completions";
import { getRoute } from "@/lib/routes";
import { getKudosForCompletions } from "@/lib/kudos";
import { featuredMilestone, getUserAchievementStats } from "@/lib/achievements";
import { getCurrentUser } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/format";
import { publicationBlockReason } from "@/lib/track";
import Card from "@/components/ui/Card";

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
    completion.dauerSekunden ? formatDuration(completion.dauerSekunden) : null,
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
        type: "article",
        title: `${titel} – Fahrt von ${fahrer}`,
        description: beschreibung,
      },
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
      type: "article",
      title: `${route.name} – Fahrt von ${fahrer}`,
      description: beschreibung,
    },
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
  const avgKmh =
    tempoSekunden && tempoSekunden > 0 && completion.distanzKm
      ? completion.distanzKm / (tempoSekunden / 3600)
      : null;

  // Nur zeigen, wenn sich die beiden Zeiten spürbar unterscheiden — sonst
  // steht dieselbe Zahl zweimal da.
  const zeigtBewegtzeit =
    completion.bewegteZeitSekunden !== null &&
    completion.dauerSekunden !== null &&
    completion.dauerSekunden - completion.bewegteZeitSekunden > 60;

  const hoehenprofil = istFreieFahrt ? completion.hoehenprofil : (route?.hoehenprofil ?? null);
  const VehicleIcon = completion.vehicle?.typ === "motorrad" ? Bike : Car;

  return (
    <div className="flex h-dvh flex-col">
      <Header back={completion.isOwner ? "/profil" : `/fahrer/${completion.userId}`} />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10 lg:max-w-3xl">
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
                `${route!.start_ort} → ${route!.ziel_ort}`
              )}
            </p>
            {/* Rückverweis nur für den Besitzer, nur bei einer automatisch
                erkannten Streckenfahrt (siehe lib/lapDetection.ts) — die
                Verknüpfung ist bewusst nicht Teil der öffentlichen Views,
                siehe CompletionDetail.parentCompletionId. */}
            {completion.isOwner && completion.parentCompletionId && (
              <Link
                href={`/fahrten/${completion.parentCompletionId}`}
                className="mt-1 inline-block text-sm text-accent hover:underline"
              >
                Teil einer längeren Fahrt — ansehen →
              </Link>
            )}
          </div>

          <Card className="h-64 overflow-hidden sm:h-80">
            <CompletionMap route={route} track={completion.track} />
          </Card>

          {detectedSegments.length > 0 && <DetectedSegmentsCard segments={detectedSegments} />}

          {(completion.vehicle || completion.abdeckungProzent !== null || completion.notiz) && (
            <Card surface className="flex flex-col gap-4 p-4">
              {completion.vehicle && (
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                    <VehicleIcon className="h-5 w-5 text-muted" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {completion.vehicle.marke} {completion.vehicle.modell}
                  </p>
                </div>
              )}
              {completion.abdeckungProzent !== null && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted">
                      <RouteIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Streckenabdeckung
                    </span>
                    <span className="font-mono tabular-nums text-foreground">
                      {completion.abdeckungProzent}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(100, Math.max(0, completion.abdeckungProzent))}%` }}
                    />
                  </div>
                </div>
              )}
              {completion.notiz && (
                <p className="text-sm leading-relaxed text-foreground">{completion.notiz}</p>
              )}
            </Card>
          )}

          <CompletionPhotoGallery
            photos={completion.photos}
            canRemove={completion.isOwner}
            displayName={completion.displayName}
          />

          {/* Bento-Stats — dasselbe Muster wie app/strecken/[id]/page.tsx und
              app/profil/page.tsx: Distanz/Zeit als betonte Kacheln, Rest
              kleinteiliger daneben. */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card surface className="flex flex-col justify-between gap-1 p-4">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                Distanz
              </dt>
              <dd className="text-title font-mono font-semibold tabular-nums">
                {(completion.distanzKm ?? route?.laenge_km ?? 0).toFixed(1)} km
              </dd>
            </Card>
            <Card surface className="flex flex-col justify-between gap-1 p-4">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Zeit
              </dt>
              <dd className="text-title font-mono font-semibold tabular-nums">
                {completion.dauerSekunden !== null ? formatDuration(completion.dauerSekunden) : "—"}
              </dd>
              {zeigtBewegtzeit && (
                <dd className="font-mono text-xs tabular-nums text-muted">
                  {formatDuration(completion.bewegteZeitSekunden!)} in Bewegung
                </dd>
              )}
            </Card>
            <Card surface className="flex flex-col justify-between gap-1 p-4">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                Ø Tempo
              </dt>
              <dd className="font-mono tabular-nums">
                {avgKmh !== null ? `${avgKmh.toFixed(0)} km/h` : "—"}
              </dd>
            </Card>
            <Card surface className="flex flex-col justify-between gap-1 p-4">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <Mountain className="h-3.5 w-3.5" aria-hidden="true" />
                {istFreieFahrt ? "Aufstieg" : "Höhe"}
              </dt>
              <dd className="font-mono tabular-nums">
                {istFreieFahrt
                  ? completion.hoehenmeterAufstieg !== null
                    ? `${completion.hoehenmeterAufstieg} m`
                    : "—"
                  : route!.hoehe_m !== null
                    ? `${route!.hoehe_m} m`
                    : "—"}
              </dd>
            </Card>
          </dl>

          {hoehenprofil && hoehenprofil.length > 1 && <ElevationProfile punkte={hoehenprofil} />}
        </main>
      </div>
    </div>
  );
}
