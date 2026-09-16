import { redirect } from "next/navigation";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  Award,
  Bookmark,
  Car,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Gauge,
  Route as RouteIcon,
  Settings,
  Timer,
} from "lucide-react";
import Header from "@/components/Header";
import PullToRefreshArea from "@/components/PullToRefreshArea";
import MarkSeen from "@/components/MarkSeen";
import VehicleGrid from "@/components/VehicleGrid";
import AvatarUpload from "@/components/AvatarUpload";
import RideVisibilityToggle from "@/components/RideVisibilityToggle";
import AchievementBadges from "@/components/AchievementBadges";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import CountUp from "@/components/CountUp";
import FollowCounts from "@/components/FollowCounts";
import PremiumCard from "@/components/PremiumCard";
import FahrtStatistik from "@/components/FahrtStatistik";
import { ChartIcon, ShieldIcon } from "@/components/NavIcons";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/premium";
import { isModerator } from "@/lib/moderation";
import { istCreator } from "@/lib/creatorKennzahlen";
import { getRollenItems } from "@/lib/nav";
import { getUnseenKudosCount } from "@/lib/kudos";
import { markKudosSeen } from "@/lib/actions/kudos";
import { getFollowCounts, getFollowerProfiles, getFollowingProfiles } from "@/lib/follows";
import { formatDuration, formatKm } from "@/lib/format";
import { freieFahrtTitel } from "@/lib/completions";
import { publicationBlockReason } from "@/lib/track";
import { summiereHoehenmeter } from "@/lib/hoehenmeter";
import type { FahrtArt, Vehicle } from "@/types/database";
import Card from "@/components/ui/Card";
import Kennzahl, { Kennzahlen } from "@/components/ui/Kennzahl";
import SectionHeading from "@/components/ui/SectionHeading";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants, textAktionClassName } from "@/components/ui/Button";
import { iconButtonVariants } from "@/components/ui/IconButton";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

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
  // getCurrentUser() statt supabase.auth.getUser(): derselbe GoTrue-Roundtrip
  // fiel sonst dreimal pro Request an — hier, in getPremiumStatus() und in
  // <Header />. Die cache()-Variante teilt ihn (siehe lib/supabase/server.ts).
  const user = await getCurrentUser();

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
    unseenKudos,
    istMod,
    istCreatorKonto,
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
    // Der Pässe-Zähler ist streckenbezogen: ohne den art-Filter käme seit
    // 0044_freie_fahrten.sql für jede freie Fahrt eine Zeile mit
    // route_id = null dazu und der Zähler wäre um eins zu hoch. Die
    // Höhenmeter kommen nicht mehr aus dieser Abfrage (früher über den
    // Join routes(hoehe_m)), sondern aus trackedRides unten — siehe
    // lib/hoehenmeter.ts.
    supabase
      .from("route_completions")
      .select("route_id")
      .eq("user_id", user.id)
      .eq("art", "strecke")
      .returns<{ route_id: string }[]>(),
    // Beide Fahrtarten: freie Fahrten stehen in derselben Liste wie
    // Streckenfahrten und zählen in "Km gefahren"/"Anzahl Fahrten" mit —
    // anders als in den globalen Bestenlisten, die streckenbasiert bleiben
    // (siehe 0044_freie_fahrten.sql).
    supabase
      .from("route_completions")
      .select(
        // region (0044) und routes(region) kommen nur für die
        // Premium-Auswertung mit: zwei Spalten mehr in einer Abfrage, die
        // ohnehin läuft, statt einer zweiten Runde zur Datenbank. Bei einer
        // Streckenfahrt trägt route_completions.region nichts, bei einer
        // freien Fahrt gibt es keine Strecke — deshalb weiter unten das
        // coalesce der beiden, wie es public_fahrten seit 0045 auch macht.
        "id, art, route_id, fahrzeug_id, datum, dauer_sekunden, distanz_km, ist_oeffentlich, abdeckung_prozent, notiz, titel, start_ort, region, bewegte_zeit_sekunden, hoehenmeter_aufstieg, routes(name, region)",
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
          // Nur für die Premium-Auswertung (FahrtStatistik) — eine Spalte
          // mehr in einer Abfrage, die ohnehin läuft, statt einer zweiten
          // Runde zur Datenbank.
          fahrzeug_id: string | null;
          datum: string;
          dauer_sekunden: number;
          distanz_km: number;
          ist_oeffentlich: boolean;
          abdeckung_prozent: number | null;
          notiz: string | null;
          titel: string | null;
          start_ort: string | null;
          region: string | null;
          bewegte_zeit_sekunden: number | null;
          hoehenmeter_aufstieg: number | null;
          routes: { name: string; region: string | null } | null;
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
    // Entscheidet, ob MarkSeen unten überhaupt etwas tut. Bewusst die
    // reine Kudos-Zahl und nicht die Gesamtzahl aus getUnseenActivityCount,
    // die <Header /> zeigt: diese Seite zeigt nur die eigenen Fahrten und
    // markiert deshalb auch nur die Kudos als gesehen (0100). Neue Follower
    // bleiben ungesehen, bis sie auf /aktivitaet tatsächlich zu sehen waren.
    getUnseenKudosCount(),
    // Für den Rollen-Abschnitt weiter unten. Kosten hier: keine. <Header />
    // rendert auf derselben Anfrage und ruft beide ohnehin auf; sie sind
    // per cache() request-weit memoisiert.
    isModerator(user.id),
    istCreator(user.id),
  ]);

  // Die mobile Leiste (BottomNav) führt Creator und Moderation nicht mehr —
  // sie ist auf fünf Einträge gedeckelt, siehe lib/nav.ts. Unter md ist das
  // hier der Weg dorthin; ab md steht er wieder in der Textnavigation des
  // Headers, deshalb md:hidden.
  const rollen = getRollenItems({ moderator: istMod, creator: istCreatorKonto });

  // Pro Strecke nur einmal zählen (auch bei mehrfacher Befahrung) — wie im
  // öffentlichen Profil (lib/profile.ts).
  const passCount = new Set((completions ?? []).map((c) => c.route_id)).size;
  // Höhenmeter über dieselbe Fahrtenliste wie "Km gefahren" und "Anzahl
  // Fahrten" darunter, damit die vier Kacheln denselben Bestand beschreiben.
  // Gezählt wird der kumulierte Anstieg, nicht mehr die Scheitelhöhe der
  // Strecke — siehe lib/hoehenmeter.ts.
  const hoehenmeter = summiereHoehenmeter(trackedRides ?? []);

  const getrackteDistanzGesamt = (trackedRides ?? []).reduce(
    (sum, r) => sum + r.distanz_km,
    0,
  );

  return (
    <div className="flex h-dvh flex-col">
      <MarkSeen hasUnseen={unseenKudos > 0} markSeen={markKudosSeen} />
      <Header />
      {/* Scroll-Container ist der volle Rest der Seitenbreite, nicht das
          zentrierte max-w-Element darin — sonst sitzt die native
          Browser-Scrollbar am Rand der Content-Spalte statt am echten
          Viewport-Rand, sobald das Fenster breiter als max-w ist. */}
      {/* Ziehen zum Aktualisieren (nur Touch) — siehe PullToRefreshArea.tsx */}
      <PullToRefreshArea>
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <AvatarUpload avatarUrl={profile?.avatar_url ?? null} name={profile?.display_name ?? null} />
            {/* Ersetzt den vorherigen "Abmelden"-Textlink an dieser Stelle —
                Abmelden ist jetzt der Abschnitt "Sitzung" in den Einstellungen
                (app/profil/einstellungen), dafür hier ein unauffälliger
                Zugang zu den Einstellungen selbst statt eines zweiten,
                redundanten Links weiter unten.

                iconButtonVariants statt einer eigenen Klassenkette: die war
                p-2 um ein 16-px-Icon, also 32 px Tippfläche. IconButton
                schreibt 44 px fest (min-h-11/min-w-11) und begründet den
                Wert in seinem eigenen Kopf — diese Stelle war schlicht an
                ihm vorbeigebaut. Die Form ist identisch (runder Rahmen,
                gedämpftes Icon), nur die Fläche stimmt jetzt. */}
            <Link
              href="/profil/einstellungen"
              aria-label="Einstellungen"
              className={iconButtonVariants()}
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-display font-semibold">{profile?.display_name ?? user.email}</h1>
            <p className="text-sm text-muted">{user.email}</p>
            <FollowCounts
              followersCount={followCounts.followers}
              followingCount={followCounts.following}
              followers={followers}
              following={following}
            />
          </div>
          {/* grid statt flex-wrap: beide Schaltflächen sollen gleich breit
              sein (die halbe Zeile), unabhängig von ihrer unterschiedlich
              langen Beschriftung — mit flex-wrap wäre jede nur so breit wie
              ihr eigener Text.

              size="md" statt "sm", und "Öffentliches Profil" statt
              "Öffentliches Profil ansehen". Nachgerechnet für 390 px: der
              Seitenrahmen nimmt 2 × 20 px, das gap 8 px, jede Zelle bleibt
              bei 171 px. Die alte Beschriftung braucht in text-xs rund
              150 px plus 2 × 12 px Innenabstand — sie lief also über und
              brach in zwei Zeilen um. "ansehen" sagt dabei nichts, was der
              Knopf nicht ohnehin tut.

              "sm" ist ausserdem 36 px hoch. Das ist die Grösse für einen
              Knopf IN einer Liste, nicht für die zwei Hauptwege einer
              Seite; 44 px ist der Wert, den components/ui/IconButton für
              diese App festschreibt. */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/strecken/neu"
              className={buttonVariants({ variant: "primary", className: "w-full" })}
            >
              + Strecke erstellen
            </Link>
            <Link
              href={`/fahrer/${user.id}`}
              className={buttonVariants({ variant: "secondary", className: "w-full" })}
            >
              Öffentliches Profil
            </Link>
          </div>
        </div>

        {/* Eine Rahmenebene statt drei. Vorher lag hier eine Gruppen-Card
            um vier verschachtelte Kacheln und drei <details> — auf einem
            390-px-Schirm sind das drei ineinandergeschachtelte Rahmenlinien
            um denselben Inhalt, und die äusserste umschloss am Ende fast die
            ganze Seitenbreite, rahmte also nichts ein, was nicht ohnehin
            abgegrenzt gewesen wäre.

            Die Überschrift und die Trennlinien zwischen den Abschnitten
            leisten die Gruppierung. Mit dem Rahmen geht auch sein
            Innenabstand: die Inhalte laufen jetzt bis an den Seitenrand des
            Seitenrahmens, was auf dem Telefon 32 px Breite zurückgibt.
            Siehe docs/design-vereinfachung.md, Abschnitt 3.9. */}
        <section className="flex flex-col gap-3">
          <SectionHeading icon={Gauge}>Kennzahlen</SectionHeading>
          <Kennzahlen>
            <Kennzahl beschriftung="Pässe befahren" wert={<CountUp value={passCount} />} />
            <Kennzahl
              beschriftung="Höhenmeter gesammelt"
              wert={<CountUp value={hoehenmeter} unit="m" />}
            />
            <Kennzahl
              beschriftung="Km gefahren"
              wert={<CountUp value={getrackteDistanzGesamt} unit="km" />}
            />
            <Kennzahl beschriftung="Fahrten" wert={<CountUp value={trackedRides?.length ?? 0} />} />
          </Kennzahlen>

          <div className="flex flex-col divide-y divide-border border-t border-border">
            {/* Auf dem Telefon zugeklappt, ab sm offen. Der
                Aktivitätskalender ist ein Jahresraster — auf 390 px
                entweder unlesbar klein oder quer scrollbar —, und er stand
                zwischen den Kennzahlen und den Fahrten, also mitten im Weg
                zu dem, weswegen man die Seite öffnet.

                Das `open` kommt aus CSS statt aus dem Markup: details[open]
                lässt sich serverseitig nicht pro Breakpoint setzen, und ein
                Client-Anteil nur dafür wäre zu viel. Siehe
                app/globals.css, Regel `details.ab-sm-offen`. */}
            <details className="group ab-sm-offen py-4">
              <SectionSummary icon={Award} label="Auszeichnungen" />
              <div className="mt-4">
                <AchievementBadges
                  passCount={passCount}
                  hoehenmeter={hoehenmeter}
                  fahrtenCount={trackedRides?.length ?? 0}
                />
              </div>
            </details>

            <details className="group ab-sm-offen py-4">
              <SectionSummary icon={CalendarDays} label="Aktivität" />
              <div className="mt-4">
                <ActivityHeatmap dates={(trackedRides ?? []).map((r) => r.datum)} />
              </div>
            </details>

            {/* Additiv: Ohne Abo steht hier nichts statt eines gesperrten
                Symbols — ein Schloss an einer Stelle, an der vorher nichts
                war, liest sich als Wegnahme (docs/premium-plan.md,
                Abschnitt 4). Die Kaufseite wirbt ohnehin damit. */}
            {premiumStatus.aktiv && (
              <details open className="group py-4">
                <SectionSummary icon={ChartIcon} label="Auswertung" />
                <div className="mt-4">
                  <FahrtStatistik
                    fahrten={(trackedRides ?? []).map((r) => ({
                      datum: r.datum,
                      distanz_km: r.distanz_km,
                      hoehenmeter_aufstieg: r.hoehenmeter_aufstieg,
                      fahrzeug_id: r.fahrzeug_id,
                      route_id: r.route_id,
                      // Streckenfahrt: die Region der Strecke. Freie Fahrt:
                      // die beim Speichern ermittelte Region der Fahrt
                      // selbst. Dieselbe Reihenfolge wie in public_fahrten
                      // (0045), damit dieselbe Fahrt nicht je nach Ansicht
                      // in einer anderen Region liegt.
                      region: r.routes?.region ?? r.region,
                    }))}
                    fahrzeuge={(vehicles ?? []).map((v) => ({
                      id: v.id,
                      marke: v.marke,
                      modell: v.modell,
                    }))}
                  />
                </div>
              </details>
            )}
          </div>
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
            <SectionHeading icon={RouteIcon}>Meine Fahrten</SectionHeading>
            {/* Flach wie der Kennzahlen-Block darüber, nicht in einer Card.
                Die Card hier war die dritte Rahmenebene, die Abschnitt 3.9
                des Konzepts eigentlich abschaffen wollte — sie ist bei den
                Kennzahlen gefallen und hier stehen geblieben, mit dem
                Ergebnis, dass zwei benachbarte Abschnitte derselben Seite
                unterschiedlich gerahmt waren.

                Sie kostete ausserdem echte Breite: Card-Rahmen plus p-4 der
                <details> plus der Rahmen der Liste darin sind auf einem
                390-px-Schirm drei ineinanderliegende Linien und 2 × 17 px
                Innenabstand. Jetzt trägt die Liste den einzigen Rahmen, und
                die Trennlinien zwischen den Klappen leisten die Gruppierung
                — dasselbe Muster, das der Kennzahlen-Block schon benutzt. */}
            <div className="flex flex-col divide-y divide-border border-t border-border">
              <details open className="group py-4">
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
              <details className="group py-4">
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
            </div>
          </section>

          {/* Fahrzeuge: eigenständige, volle Breite statt in einer
              "Verwaltung"-Gruppen-Card versteckt oder in einer festen
              Desktop-Spalte neben "Meine Fahrten" gequetscht — so kann das
              Kachel-Raster auf breiten Bildschirmen mehr Spalten zeigen statt
              auf halber Breite zu verharren. Streckenvorschläge sind in die
              neuen Einstellungen umgezogen (app/profil/einstellungen). */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionHeading icon={Car}>Fahrzeuge</SectionHeading>
              <Link href="/profil/fahrzeuge/neu" className={textAktionClassName()}>
                + Hinzufügen
              </Link>
            </div>
            <VehicleGrid vehicles={(vehicles as Vehicle[]) ?? []} />
          </section>

          {/* Zuunterst und ohne Unterbrechung der Kernschleife: ohne Abo ein
              einzelner Hinweis mit dem Kauf-Einstieg. Kein Banner über den
              Fahrten, kein Einschub zwischen Strecke und Aufzeichnung — was
              zahlende Nutzer erst hervorbringt, ist die Nutzung selbst.

              Mit Abo steht hier nichts: die Verwaltung (Abo-Zustand,
              Rechnungen, Kündigung, Zahlungsmittel) liegt ausschliesslich
              unter Einstellungen → Abo verwalten
              (app/profil/einstellungen/abo). Vorher gab es sie an beiden
              Stellen — das Profil ist die öffentliche Selbstdarstellung,
              nicht der Ort für Abrechnung, und zwei Einstiege ins
              Stripe-Portal sind einer zu viel. */}
          {rollen.length > 0 && (
            <section className="flex flex-col gap-2 md:hidden">
              <SectionHeading icon={ShieldIcon}>Deine Bereiche</SectionHeading>
              <Card className="flex flex-col divide-y divide-border">
                {rollen.map((rolle) => {
                  const Icon = rolle.icon;
                  return (
                    <Link
                      key={rolle.href}
                      href={rolle.href}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors duration-fast hover:text-accent"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      {rolle.label}
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    </Link>
                  );
                })}
              </Card>
            </section>
          )}

          {!premiumStatus.aktiv && <PremiumCard status={premiumStatus} />}
        </div>
        </Seitenrahmen>
      </div>
      </PullToRefreshArea>
    </div>
  );
}
