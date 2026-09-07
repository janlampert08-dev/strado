import { redirect } from "next/navigation";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  Award,
  Bookmark,
  Car,
  CalendarDays,
  ChevronDown,
  Route as RouteIcon,
  Settings,
  Timer,
} from "lucide-react";
import Header from "@/components/Header";
import MarkKudosSeen from "@/components/MarkKudosSeen";
import VehicleGrid from "@/components/VehicleGrid";
import AvatarUpload from "@/components/AvatarUpload";
import RideVisibilityToggle from "@/components/RideVisibilityToggle";
import AchievementBadges from "@/components/AchievementBadges";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import CountUp from "@/components/CountUp";
import FollowCounts from "@/components/FollowCounts";
import PremiumCard from "@/components/PremiumCard";
import { createClient } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/premium";
import { getFollowCounts, getFollowerProfiles, getFollowingProfiles } from "@/lib/follows";
import { formatDuration, formatKm } from "@/lib/format";
import { freieFahrtTitel } from "@/lib/completions";
import { publicationBlockReason } from "@/lib/track";
import type { FahrtArt, Vehicle } from "@/types/database";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";

// Gemeinsamer Stil für die aufklappbaren Unterabschnitte innerhalb einer
// Gruppen-Card (siehe AdvancedFiltersPanel.tsx für dasselbe native
// <details>-Muster) — Icon + Label + optionale Anzahl links, Chevron rechts.
function SectionSummary({
  icon: Icon,
  label,
  count,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <span className="flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
        {label}
        {count !== undefined && (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-xs font-normal text-muted">
            {count}
          </span>
        )}
      </span>
      <ChevronDown
        className="h-4 w-4 text-muted transition-transform duration-fast group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>
  );
}

export default async function ProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/anmelden");
  }

  // Alle voneinander unabhängigen Abfragen parallel statt nacheinander —
  // spart auf einer Seite mit sechs Queries einen entsprechend langen
  // Round-Trip-Wasserfall (vorher: jede Query wartete auf die vorherige,
  // obwohl keine von einer anderen abhängt).
  const [
    { data: profile },
    { data: vehicles },
    { data: completions },
    { data: trackedRides },
    { data: favorites },
    followCounts,
    followers,
    following,
    premiumStatus,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url, zeigt_fahrzeuge")
      .eq("id", user.id)
      .single(),
    // Explizit auf den eigenen Nutzer filtern statt allein auf RLS zu
    // vertrauen: die zweite SELECT-Policy "Fahrzeuge sichtbar wenn
    // freigegeben" (0015) erlaubt RLS-seitig auch fremde Fahrzeuge, deren
    // Besitzer zeigt_fahrzeuge aktiviert hat (fürs öffentliche Profil gedacht,
    // siehe lib/profile.ts) — ohne dieses .eq() würden beide Policies
    // per OR kombiniert und fremde freigegebene Fahrzeuge hier mit einfliessen.
    supabase
      .from("vehicles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    // Pässe und Höhenmeter sind streckenbezogene Kennzahlen: ohne den
    // art-Filter käme seit 0044_freie_fahrten.sql für jede freie Fahrt eine
    // Zeile mit route_id = null dazu und der Pässe-Zähler wäre um eins zu
    // hoch (siehe hoeheProRoute unten).
    supabase
      .from("route_completions")
      .select("route_id, routes(hoehe_m)")
      .eq("user_id", user.id)
      .eq("art", "strecke")
      .returns<{ route_id: string; routes: { hoehe_m: number | null } | null }[]>(),
    // Beide Fahrtarten: freie Fahrten stehen in derselben Liste wie
    // Streckenfahrten und zählen in "Km gefahren"/"Anzahl Fahrten" mit —
    // anders als in den globalen Bestenlisten, die streckenbasiert bleiben
    // (siehe 0044_freie_fahrten.sql).
    supabase
      .from("route_completions")
      .select(
        "id, art, route_id, datum, dauer_sekunden, distanz_km, ist_oeffentlich, abdeckung_prozent, notiz, titel, start_ort, bewegte_zeit_sekunden, routes(name)",
      )
      .eq("user_id", user.id)
      .not("dauer_sekunden", "is", null)
      // Neueste zuerst — created_at als Tiebreaker, da datum nur ein Datum
      // (kein Zeitstempel) ist und mehrere Fahrten am selben Tag sonst in
      // unbestimmter Reihenfolge stünden.
      .order("datum", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          art: FahrtArt;
          route_id: string | null;
          datum: string;
          dauer_sekunden: number;
          distanz_km: number;
          ist_oeffentlich: boolean;
          abdeckung_prozent: number | null;
          notiz: string | null;
          titel: string | null;
          start_ort: string | null;
          bewegte_zeit_sekunden: number | null;
          routes: { name: string } | null;
        }[]
      >(),
    supabase
      .from("favorites")
      .select("route_id, routes(id, name, region, laenge_km)")
      .eq("user_id", user.id)
      .order("erstellt_am", { ascending: false })
      .returns<
        {
          route_id: string;
          routes: { id: string; name: string; region: string; laenge_km: number } | null;
        }[]
      >(),
    getFollowCounts(user.id),
    getFollowerProfiles(user.id),
    getFollowingProfiles(user.id),
    getPremiumStatus(),
  ]);

  // Pro Strecke nur einmal zählen (auch bei mehrfacher Befahrung) — sonst
  // widersprechen sich passCount (dedupliziert) und hoehenmeter auf demselben
  // Screen; entspricht der Dedup-Logik in lib/profile.ts (öffentliches Profil).
  const hoeheProRoute = new Map<string, number>();
  for (const c of completions ?? []) {
    if (!hoeheProRoute.has(c.route_id)) hoeheProRoute.set(c.route_id, c.routes?.hoehe_m ?? 0);
  }
  const passCount = hoeheProRoute.size;
  const hoehenmeter = [...hoeheProRoute.values()].reduce((sum, h) => sum + h, 0);

  const getrackteDistanzGesamt = (trackedRides ?? []).reduce(
    (sum, r) => sum + r.distanz_km,
    0,
  );

  return (
    <div className="flex h-dvh flex-col">
      <MarkKudosSeen />
      <Header />
      {/* Scroll-Container ist der volle Rest der Seitenbreite, nicht das
          zentrierte max-w-Element darin — sonst sitzt die native
          Browser-Scrollbar am Rand der Content-Spalte statt am echten
          Viewport-Rand, sobald das Fenster breiter als max-w ist. */}
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10 lg:max-w-4xl">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <AvatarUpload avatarUrl={profile?.avatar_url ?? null} name={profile?.display_name ?? null} />
            {/* Ersetzt den vorherigen "Abmelden"-Textlink an dieser Stelle —
                Abmelden ist jetzt Teil des Konto-Tabs in den Einstellungen
                (app/profil/einstellungen), dafür hier ein unauffälliger
                Zugang zu den Einstellungen selbst statt eines zweiten,
                redundanten Links weiter unten. */}
            <Link
              href="/profil/einstellungen"
              aria-label="Einstellungen"
              className="shrink-0 rounded-full border border-border p-2 text-muted transition-colors duration-fast hover:border-border-strong hover:text-foreground"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-display font-semibold">
              {profile?.display_name ?? user.email}
            </h1>
            <p className="text-sm text-muted">{user.email}</p>
            <FollowCounts
              followersCount={followCounts.followers}
              followingCount={followCounts.following}
              followers={followers}
              following={following}
            />
          </div>
          {/* grid statt flex-wrap: beide Buttons sollen gleich breit sein
              (die halbe Zeile), unabhängig von ihrer unterschiedlich langen
              Beschriftung — mit flex-wrap wäre jeder Button nur so breit wie
              sein eigener Text. */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/strecken/neu"
              className={buttonVariants({ variant: "primary", size: "sm", className: "w-full" })}
            >
              + Strecke vorschlagen
            </Link>
            <Link
              href={`/fahrer/${user.id}`}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "w-full" })}
            >
              Öffentliches Profil ansehen
            </Link>
          </div>
        </div>

        {/* Statistiken: Kennzahlen-Grid, Auszeichnungen und Aktivitätskalender
            gehören inhaltlich zusammen ("meine Zahlen") und stecken deshalb in
            einer gemeinsamen Gruppen-Card statt als drei gleichrangige,
            eigenständige Sections — Auszeichnungen/Aktivität als native
            <details> darin (siehe SectionSummary oben), auf/zu ohne eigenes
            State-Management. Beide standardmässig offen: dieselben Infos wie
            vorher sind weiterhin ohne Klick sichtbar, nur jetzt gruppiert und
            bei Bedarf einklappbar. */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Statistiken</h2>
          <Card className="flex flex-col divide-y divide-border">
            <dl className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <Card surface className="flex flex-col justify-between gap-1 p-4">
                <dt className="text-sm text-muted">Pässe befahren</dt>
                <dd className="text-title font-mono font-semibold tabular-nums">
                  <CountUp value={passCount} />
                </dd>
              </Card>
              <Card surface className="flex flex-col justify-between gap-1 p-4">
                <dt className="text-sm text-muted">Höhenmeter gesammelt</dt>
                <dd className="text-title font-mono font-semibold tabular-nums">
                  <CountUp value={hoehenmeter} unit="m" />
                </dd>
              </Card>
              <Card surface className="flex flex-col justify-between gap-1 p-4">
                <dt className="text-sm text-muted">Km gefahren</dt>
                <dd className="font-mono text-lg tabular-nums">
                  <CountUp value={getrackteDistanzGesamt} unit="km" />
                </dd>
              </Card>
              <Card surface className="flex flex-col justify-between gap-1 p-4">
                <dt className="text-sm text-muted">Anzahl Fahrten</dt>
                <dd className="font-mono text-lg tabular-nums">
                  <CountUp value={trackedRides?.length ?? 0} />
                </dd>
              </Card>
            </dl>

            <details open className="group p-4">
              <SectionSummary icon={Award} label="Auszeichnungen" />
              <div className="mt-4">
                <AchievementBadges
                  passCount={passCount}
                  hoehenmeter={hoehenmeter}
                  fahrtenCount={trackedRides?.length ?? 0}
                />
              </div>
            </details>

            <details open className="group p-4">
              <SectionSummary icon={CalendarDays} label="Aktivität" />
              <div className="mt-4">
                <ActivityHeatmap dates={(trackedRides ?? []).map((r) => r.datum)} />
              </div>
            </details>
          </Card>
        </section>

        <div className="flex flex-col gap-8">
          {/* Meine Fahrten: getrackte Fahrten und gemerkte Strecken drehen sich
              beide um "Strecken, mit denen ich zu tun habe" — eine
              Gruppen-Card statt zwei unabhängiger Sections nebeneinander.
              Volle Breite statt einer Zweispalten-Aufteilung mit Fahrzeuge:
              die getrackten Fahrten sind praktisch immer deutlich länger als
              die Garage, eine feste Spalte daneben liess auf Desktop viel
              Leerraum neben der kurzen Fahrzeuge-Liste stehen. */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
              Meine Fahrten
            </h2>
            <Card className="flex flex-col divide-y divide-border">
              <details open className="group p-4">
                <SectionSummary
                  icon={RouteIcon}
                  label="Getrackte Fahrten"
                  count={trackedRides?.length ?? 0}
                />
                <div className="mt-4">
                  {trackedRides && trackedRides.length > 0 ? (
                    // Eine Zeile pro Fahrt statt einer eigenen Card mit
                    // Trennlinie — Name+Datum und Stats+Aktionen passen in
                    // zwei kompakte Zonen, Hover-Feedback jetzt auf der
                    // ganzen Zeile (vorher nur auf dem Streckennamen-Text,
                    // wirkte dadurch wie ein verzögerter/inkonsistenter
                    // Hover-Effekt).
                    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {trackedRides.map((ride) => {
                        const avgKmh =
                          ride.dauer_sekunden > 0
                            ? ride.distanz_km / (ride.dauer_sekunden / 3600)
                            : 0;
                        return (
                          <li key={ride.id} className="group transition-colors duration-fast hover:bg-surface">
                            <div className="flex items-center justify-between gap-3 p-3">
                              <Link href={`/fahrten/${ride.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="min-w-0 truncate font-medium transition-colors duration-fast group-hover:text-accent">
                                  {ride.art === "frei"
                                    ? freieFahrtTitel(ride.titel, ride.start_ort)
                                    : (ride.routes?.name ?? "Strecke")}
                                </span>
                                {/* Datum jetzt Teil derselben mono/tabular-nums-Zeile wie
                                    Dauer/Tempo statt separat rechts neben dem Titel — gleiche
                                    Schrift, Grösse und Punkt-Trennung wie die übrigen Werte. */}
                                <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted">
                                  <span>{new Date(ride.datum).toLocaleDateString("de-CH")}</span>
                                  <span aria-hidden="true">·</span>
                                  {/* Stoppuhr-Icon davor, damit "06:26" nicht als Uhrzeit
                                      gelesen wird — es ist die gestoppte Fahrtdauer. Gleiche
                                      Farbe wie der Text (kein Akzent), bewusst unauffällig. */}
                                  <span className="flex items-center gap-1">
                                    <Timer className="h-3 w-3" aria-hidden="true" />
                                    {formatDuration(ride.dauer_sekunden)}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{avgKmh.toFixed(0)} km/h</span>
                                </div>
                              </Link>
                              {/* Beide Fahrtarten lassen sich hier teilen —
                                  gesperrt wird je nach Art über den
                                  Deckungsgrad (Strecke) oder die Mindestwerte
                                  (freie Fahrt, siehe lib/track.ts). */}
                              <RideVisibilityToggle
                                completionId={ride.id}
                                isPublic={ride.ist_oeffentlich}
                                coveragePercent={ride.abdeckung_prozent}
                                blockedReason={
                                  ride.art === "frei"
                                    ? publicationBlockReason(
                                        ride.distanz_km,
                                        ride.bewegte_zeit_sekunden ?? ride.dauer_sekunden,
                                      )
                                    : null
                                }
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={RouteIcon}
                      title="Noch keine Fahrten aufgezeichnet."
                      action={
                        <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                          Strecken entdecken
                        </Link>
                      }
                    />
                  )}
                </div>
              </details>

              {/* Einzige standardmässig zugeklappte Sektion auf der Seite:
                  Favoriten sind ein Lesezeichen für später, nicht "was ich
                  gerade gefahren bin" — im Unterschied zu allen anderen
                  Abschnitten hier verliert niemand etwas Wichtiges, wenn das
                  erst auf Wunsch aufklappt. */}
              <details className="group p-4">
                <SectionSummary icon={Bookmark} label="Favoriten" count={favorites?.length ?? 0} />
                <div className="mt-4">
                  {favorites && favorites.length > 0 ? (
                    <Card as="ul" className="divide-y divide-border">
                      {favorites.map((f) =>
                        f.routes ? (
                          <li key={f.route_id}>
                            <Link
                              href={`/strecken/${f.route_id}`}
                              className="group flex items-baseline justify-between px-4 py-3 transition-colors duration-fast hover:bg-surface"
                            >
                              <span className="transition-colors duration-fast group-hover:text-accent">
                                {f.routes.name}
                              </span>
                              <span className="font-mono text-sm tabular-nums text-muted">
                                {formatKm(f.routes.laenge_km)} km
                              </span>
                            </Link>
                          </li>
                        ) : null,
                      )}
                    </Card>
                  ) : (
                    <EmptyState
                      icon={Bookmark}
                      title="Noch keine Favoriten gemerkt."
                      action={
                        <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                          Strecken entdecken
                        </Link>
                      }
                    />
                  )}
                </div>
              </details>
            </Card>
          </section>

          {/* Fahrzeuge: eigenständige, volle Breite statt in einer
              "Verwaltung"-Gruppen-Card versteckt oder in einer festen
              Desktop-Spalte neben "Meine Fahrten" gequetscht — so kann das
              Kachel-Raster auf breiten Bildschirmen mehr Spalten zeigen statt
              auf halber Breite zu verharren. Streckenvorschläge sind in die
              neuen Einstellungen umgezogen (app/profil/einstellungen). */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
                <Car className="h-4 w-4" aria-hidden="true" />
                Fahrzeuge
              </h2>
              <Link
                href="/profil/fahrzeuge/neu"
                className="text-sm font-medium text-accent hover:underline"
              >
                + Hinzufügen
              </Link>
            </div>
            <VehicleGrid vehicles={(vehicles as Vehicle[]) ?? []} />
          </section>

          {/* Zuunterst und ohne Unterbrechung der Kernschleife: die Karte
              zeigt den Abo-Zustand und, ohne Abo, einen einzelnen Hinweis.
              Kein Banner über den Fahrten, kein Einschub zwischen Strecke
              und Aufzeichnung — was zahlende Nutzer erst hervorbringt, ist
              die Nutzung selbst. */}
          <PremiumCard status={premiumStatus} />
        </div>
        </main>
      </div>
    </div>
  );
}
