import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import RouteDetailLayout from "@/components/RouteDetailLayout";
import RouteDetailMap from "@/components/RouteDetailMap";
import FavoriteButton from "@/components/FavoriteButton";
import RatingSection from "@/components/RatingSection";
import GefahrenSection from "@/components/GefahrenSection";
import RouteActionsMenu from "@/components/RouteActionsMenu";
import PublishRouteButton from "@/components/PublishRouteButton";
import ElevationProfile from "@/components/ElevationProfile";
import PhotoGallery from "@/components/PhotoGallery";
import RouteLeaderboardPreview from "@/components/RouteLeaderboardPreview";
import OfflineRouteButton from "@/components/OfflineRouteButton";
import { getKontextStrecken, getRoute } from "@/lib/routes";
import { formatKm } from "@/lib/format";
import { getRatings, getOwnRating } from "@/lib/ratings";
import { getPersonalBestSeconds } from "@/lib/completions";
import { getRoutePhotos } from "@/lib/photos";
import { isFavorite } from "@/lib/favorites";
import { isModerator } from "@/lib/moderation";
import { getPremiumStatus, maxFotosProFahrt } from "@/lib/premium";
import { getRouteLeaderboard } from "@/lib/leaderboard";
import { fetchCurrentWeather } from "@/lib/weather";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { KATEGORIEN } from "@/lib/constants";
import { averageTempolimit, estimateRouteDurationMinutes, formatMinutes } from "@/lib/geo";
import type { Vehicle } from "@/types/database";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";

const KATEGORIE_LABEL = Object.fromEntries(
  KATEGORIEN.map((k) => [k.value, k.label]),
) as Record<string, string>;

const SAISON_LABEL = { saisonal: "Saisonal (Winterschliessung)" };

// getRoute() ist mit React cache() memoisiert (lib/routes.ts) — derselbe
// Aufruf hier und in der Page unten kostet innerhalb desselben Requests
// nur eine DB-Abfrage.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const route = await getRoute(id);
  if (!route) return { title: "Strecke – Strado" };

  return {
    title: `${route.name} – Strado`,
    description:
      route.charakter_text ??
      `${route.region}: ${route.start_ort} → ${route.ziel_ort}, ${route.laenge_km.toFixed(0)} km`,
  };
}

export default async function StreckeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // ?fortsetzen=<token> trägt den Marker aus dem Anmelde-Gate einer als Gast
  // gefahrenen Strecke (siehe LiveTrackingForm.tsx) — nur mit ihm darf die
  // Aufzeichnung an das nun angemeldete Konto übergehen. Geprüft und
  // eingelöst wird er ausschliesslich im Client gegen den gespeicherten Wert
  // (adoptGuestTrackingSnapshot); hier ist er ein durchgereichter, nicht
  // vertrauenswürdiger Query-Wert.
  // ?privat=… meldet zurück, warum eine als privat angeforderte Strecke
  // NICHT privat angelegt wurde (proposeRoute in lib/actions/routes.ts):
  // "kontingent" = Gratis-Kontingent erschöpft, "fehlgeschlagen" = das
  // UPDATE auf ist_privat kam nicht durch. Beide Fälle enden damit, dass die
  // Strecke als normaler Vorschlag in die Moderation geht — das muss die
  // Person erfahren, die sie privat haben wollte. Der Marker wurde bisher
  // gesetzt, aber von niemandem gelesen.
  searchParams: Promise<{ fortsetzen?: string; privat?: string }>;
}) {
  const { id } = await params;
  const { fortsetzen, privat } = await searchParams;
  const supabase = await createClient();

  // getRoute() und getCurrentUser() sind voneinander unabhängig (Routenabruf
  // braucht den Nutzer nicht, RLS entscheidet allein über die route_id) —
  // parallel statt nacheinander gestartet.
  //
  // getCurrentUser() statt supabase.auth.getUser(): der Aufruf ist bei
  // @supabase/ssr ein Netzwerk-Roundtrip gegen GoTrue, und auf dieser Seite
  // brauchen ihn ausser der Seite selbst auch <Header /> und
  // getPremiumStatus(). Ueber den request-weiten cache() wird daraus einer
  // statt dreier.
  const [route, user] = await Promise.all([getRoute(id), getCurrentUser()]);

  if (!route) notFound();

  // kontextStrecken: die umliegenden Strecken für die Karte des
  // Aufzeichnungsschirms (siehe GefahrenSection/LiveTrackingForm). Sie werden
  // hier serverseitig mitgeladen, weil GefahrenSection eine Client-Komponente
  // ist und selbst nicht abfragen kann — im selben Promise.all wie alles
  // andere, also ohne die Antwortzeit zu verlängern.
  const [ratings, ownRating, favorite, vehicles, personalBestSeconds, photos, leaderboard, weather, moderator, premiumStatus, kontextStrecken] =
    await Promise.all([
      getRatings(id),
      user ? getOwnRating(id, user.id) : Promise.resolve(null),
      user ? isFavorite(id, user.id) : Promise.resolve(false),
      user
        ? supabase
            .from("vehicles")
            .select("*")
            .eq("user_id", user.id)
            .then((r) => (r.data as Vehicle[]) ?? [])
        : Promise.resolve([] as Vehicle[]),
      user ? getPersonalBestSeconds(id, user.id) : Promise.resolve(null),
      getRoutePhotos(id),
      getRouteLeaderboard(id),
      fetchCurrentWeather(route.start_geojson.coordinates as [number, number]),
      user ? isModerator(user.id) : Promise.resolve(false),
      getPremiumStatus(),
      getKontextStrecken(route),
    ]);

  // Strukturierte Daten für die Streckenseite — der einzige öffentlich
  // indexierbare Evergreen-Inhalt der Plattform (app/sitemap.ts listet
  // Strecken mit priority 0.8, Profile bewusst gar nicht).
  //
  // Bewusst OHNE aggregateRating: route_ratings sind seit 0025 Kommentare
  // ohne Sternewert. Eine Bewertungszahl zu erfinden, nur damit Google
  // Sterne anzeigt, wäre genau die Sorte strukturierter Daten, für die
  // Seiten abgestraft werden.
  const strukturierteDaten = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    inLanguage: "de-CH",
    name: route.name,
    ...(route.charakter_text ? { description: route.charakter_text } : {}),
    ...(route.laenge_km
      ? { distance: `${route.laenge_km.toFixed(1)} km` }
      : {}),
    itinerary: {
      "@type": "ItemList",
      itemListElement: [
        { "@type": "Place", name: route.start_ort },
        { "@type": "Place", name: route.ziel_ort },
      ],
    },
  };

  return (
    <div className="flex h-dvh flex-col">
      {/* charakter_text, name und die Ortsnamen stammen aus einem
          Streckenvorschlag, sind also Nutzerinput. JSON.stringify escaped
          Anführungszeichen, aber NICHT "<" — ein "</script>" im Text würde
          den Block hier beenden und den Rest als Markup ausliefern. Die
          drei ersetzten Zeichen sind innerhalb eines JSON-Strings
          gleichwertige Unicode-Escapes, der geparste Wert bleibt also
          identisch. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(strukturierteDaten)
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026"),
        }}
      />
      <Header back="/" />
      <RouteDetailLayout map={<RouteDetailMap route={route} key={route.id} />}>
        <div>
          <p className="text-sm text-muted">
            {route.region}
            {route.ist_rundfahrt && " · Rundfahrt"}
          </p>
          <h1 className="text-display font-semibold tracking-tight">{route.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {route.ist_rundfahrt ? `Start/Ziel: ${route.start_ort}` : `${route.start_ort} → ${route.ziel_ort}`}
          </p>
        </div>

        {/* Nur für die Person, die die Strecke angelegt hat — für alle
            anderen ist der Query-Parameter bedeutungslos und würde nur eine
            fremde Fehlermeldung zeigen. Der Wert kommt aus der URL und ist
            damit frei setzbar; er entscheidet deshalb ausschliesslich über
            einen von zwei festen Texten und wird nirgends ausgegeben. */}
        {user?.id === route.erstellt_von && !route.ist_privat && (privat === "kontingent" || privat === "fehlgeschlagen") && (
          <Card surface className="px-3 py-2 text-sm">
            <p className="font-medium">Diese Strecke ist nicht privat.</p>
            <p className="mt-1 text-muted">
              {privat === "kontingent"
                ? "Dein Kontingent für private Strecken ist erschöpft. Die Strecke ist gespeichert und geht als normaler Vorschlag in die Moderation."
                : "Die Strecke konnte nicht auf privat gesetzt werden. Sie ist gespeichert und geht als normaler Vorschlag in die Moderation — melde dich bei uns, wenn das nicht gewollt ist."}
            </p>
          </Card>
        )}

        {route.ist_privat && user?.id === route.erstellt_von && (
          <Card surface className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="text-muted">Privat — nur du siehst diese Strecke.</span>
            <PublishRouteButton routeId={id} />
          </Card>
        )}

        <div className="flex flex-wrap items-start gap-2">
          {user && <FavoriteButton routeId={id} initialFavorite={favorite} />}
          <OfflineRouteButton
            route={{
              id: route.id,
              name: route.name,
              region: route.region,
              startOrt: route.start_ort,
              zielOrt: route.ziel_ort,
              laengeKm: route.laenge_km,
              hoeheM: route.hoehe_m,
              maxSteigungProzent: route.max_steigung_prozent,
              kehren: route.kehren,
              charakterText: route.charakter_text,
              hoehenprofil: route.hoehenprofil,
              geometryCoordinates: route.geometry_geojson.coordinates as [number, number][],
              gespeichertAm: new Date().toISOString(),
            }}
            istPremium={premiumStatus.aktiv}
          />
          <RouteActionsMenu
            route={route}
            moderator={moderator}
            isOwner={!moderator && user?.id === route.erstellt_von && !route.status_ok}
            canReport={!!user && user.id !== route.erstellt_von}
            istPremium={premiumStatus.aktiv}
          />
          {!moderator && user?.id === route.erstellt_von && !route.status_ok && (
            <Link
              href={`/strecken/${id}/bearbeiten`}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "self-start" })}
            >
              Bearbeiten
            </Link>
          )}
        </div>

        {/* Auch ohne Konto: aufzeichnen darf jeder, das Konto verlangt erst
            das Speichern (Gate im Fazit, siehe LiveTrackingForm.tsx).
            Vorher stand hier für Abgemeldete nur ein Hinweistext — auf der
            Seite, auf der ein geteilter Link landet, also ausgerechnet dort,
            wo ein Besucher ohne Konto zuerst ankommt. Der Kommentar-Teil des
            alten Hinweises lebt jetzt in RatingSection weiter, wo er
            hingehört. */}
        <GefahrenSection
          route={route}
          kontextStrecken={kontextStrecken}
          userId={user?.id ?? null}
          vehicles={vehicles}
          personalBestSeconds={personalBestSeconds}
          guestContinuationToken={fortsetzen ?? null}
          maxPhotos={maxFotosProFahrt(premiumStatus.aktiv)}
        />

        {route.hoehenprofil && route.hoehenprofil.length > 1 && (
          <ElevationProfile punkte={route.hoehenprofil} />
        )}

        {/* Bento-Layout statt einer gleichförmigen dl-Tabelle: Länge/Höhe als
            grössere, betonte Kacheln (die zwei Zahlen, die beim ersten Blick
            auf eine Strecke am meisten zählen), Rest kleinteiliger darunter.
            dl bleibt als semantischer Rahmen um alle dt/dd-Paare erhalten —
            HTML5 erlaubt dt/dd-Gruppen, die einzeln in div (hier: Card)
            gewrappt sind. */}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card surface className="col-span-1 flex flex-col justify-between gap-1 p-4">
            <dt className="text-sm text-muted">Länge</dt>
            <dd className="text-title font-mono font-semibold tabular-nums">
              {formatKm(route.laenge_km)} km
            </dd>
          </Card>
          <Card surface className="col-span-1 flex flex-col justify-between gap-1 p-4">
            <dt className="text-sm text-muted">Höhe</dt>
            <dd className="text-title font-mono font-semibold tabular-nums">
              {route.hoehe_m !== null ? `${route.hoehe_m} m` : "—"}
            </dd>
          </Card>
          <Card surface className="flex flex-col justify-between gap-1 p-4">
            <dt className="text-sm text-muted">Max. Steigung</dt>
            <dd className="font-mono tabular-nums">
              {route.max_steigung_prozent !== null ? `${route.max_steigung_prozent}%` : "—"}
            </dd>
          </Card>
          <Card surface className="flex flex-col justify-between gap-1 p-4">
            <dt className="text-sm text-muted">Kehren</dt>
            <dd className="font-mono tabular-nums">{route.kehren ?? "—"}</dd>
          </Card>
          <Card surface className="flex flex-col justify-between gap-1 p-4">
            <dt className="text-sm text-muted">Ø Tempolimit</dt>
            <dd className="font-mono tabular-nums">
              {averageTempolimit(route.tempolimits) !== null
                ? `${averageTempolimit(route.tempolimits)} km/h`
                : "—"}
            </dd>
          </Card>
          <Card surface className="flex flex-col justify-between gap-1 p-4">
            <dt className="text-sm text-muted">Fahrzeit</dt>
            <dd className="font-mono tabular-nums">
              ~
              {formatMinutes(
                estimateRouteDurationMinutes(
                  route.laenge_km,
                  route.kategorien,
                  route.tempolimits,
                ),
              )}
            </dd>
          </Card>
          <Card surface className="col-span-2 flex flex-col justify-between gap-1 p-4 sm:col-span-2">
            <dt className="text-sm text-muted">Wetter</dt>
            <dd className="font-mono tabular-nums">
              {weather ? (
                <>
                  {weather.tempC}°C
                  <span className="ml-1.5 font-sans text-xs normal-case text-muted">
                    {weather.label}
                  </span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </Card>
        </dl>

        <RouteLeaderboardPreview entries={leaderboard.slice(0, 5)} />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {route.kategorien.map((k) => (
              <span
                key={k}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground"
              >
                {KATEGORIE_LABEL[k] ?? k}
              </span>
            ))}
            {route.saison_status === "saisonal" && (
              <span className="text-sm text-muted">{SAISON_LABEL.saisonal}</span>
            )}
          </div>

          {route.charakter_text && (
            <p className="text-sm leading-relaxed text-foreground">{route.charakter_text}</p>
          )}
        </div>

        <PhotoGallery photos={photos} />

        <RatingSection
          routeId={id}
          ratings={ratings}
          ownRating={ownRating}
          canRate={!!user}
          currentUserId={user?.id ?? null}
        />
      </RouteDetailLayout>
    </div>
  );
}
