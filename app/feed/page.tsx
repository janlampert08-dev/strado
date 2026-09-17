import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Rss } from "lucide-react";
import Header from "@/components/Header";
import PullToRefreshArea from "@/components/PullToRefreshArea";
import Avatar from "@/components/Avatar";
import KudosButton from "@/components/KudosButton";
import ProfileSearch from "@/components/ProfileSearch";
import FeedReiter from "@/components/FeedReiter";
import { Signet } from "@/components/Wortmarke";
import { getFeed, type FeedScope } from "@/lib/feed";
import { freieFahrtTitel } from "@/lib/completions";
import { getCurrentUser } from "@/lib/supabase/server";
import { getUnseenActivityCount } from "@/lib/aktivitaetsliste";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

export const metadata: Metadata = {
  title: "Feed – Strado",
  description:
    "Die zuletzt gefahrenen Strecken und Touren der Strado-Community aus der ganzen Schweiz.",
  // Kanonische Adresse. Die App wird unter mehr als einem Hostnamen
  // ausgeliefert — app.strado.ch, die Vorschau-Adressen jedes Deployments,
  // dazu Staging — und lieferte bis hierher auf keiner davon ein Canonical
  // aus (im ausgelieferten HTML nachgesehen). Damit steht derselbe Inhalt
  // mehrfach zur Auswahl, und welche Adresse eine Suchmaschine nimmt, ist
  // ihre Entscheidung statt unsere.
  //
  // Der relative Pfad wird von Next gegen metadataBase aufgelöst
  // (app/layout.tsx). Bewusst ohne Query: alternates.canonical gehört an die
  // Adresse OHNE ?-Parameter, sonst zählt jeder Filter- und Marker-Wert als
  // eigene Seite.
  //
  // ?scope=folge-ich ist der zweite Reiter derselben Seite und braucht
  // deshalb keine eigene Adresse im Index.
  alternates: { canonical: "/feed" },
};

// Öffentlich lesbar wie /strecken/[id] (public_fahrten ist an anon
// freigegeben) — nur der "Folge ich"-Filter und der Kudos-Button brauchen
// eine Session. Kein Redirect zu /anmelden, damit ein geteilter Feed-Link
// auch für ausgeloggte Besucher funktioniert.
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: scopeParam } = await searchParams;
  const scope: FeedScope = scopeParam === "following" ? "following" : "global";

  const user = await getCurrentUser();

  // Für die Zahl am Reiter "Aktivität". Kostet keinen zusätzlichen
  // Roundtrip: <Header /> fragt dieselbe Zahl auf jeder Seite ab, und
  // getUnseenActivityCount ist per React cache() dedupliziert.
  const [feed, ungeseheneAktivitaet] = await Promise.all([
    getFeed(scope, user?.id ?? null),
    user ? getUnseenActivityCount() : Promise.resolve(0),
  ]);

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      {/* Ziehen zum Aktualisieren (nur Touch) — siehe PullToRefreshArea.tsx */}
      <PullToRefreshArea>
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen>
        <div>
          <h1 className="text-display font-semibold">Feed</h1>
          <p className="mt-1 text-sm text-muted">Geteilte Fahrten aus der Community.</p>
        </div>

        {/* Die Reiter stehen in einer eigenen Komponente, weil /aktivitaet
            sie mitbenutzt: die eigene Aktivität ist der dritte Blick auf
            dieselbe Frage und deshalb ein Reiter hier statt eines eigenen
            Eintrags in der Navigation (siehe lib/nav.ts).

            Für Abgemeldete bleibt genau ein Reiter übrig ("Alle") — die
            Leiste rendert dann eine einzelne Pille, was als Zustandsanzeige
            immer noch stimmt und billiger ist als ein Sonderfall. */}
        <FeedReiter
          aktiv={scope === "following" ? "following" : "global"}
          angemeldet={!!user}
          ungeseheneAktivitaet={ungeseheneAktivitaet}
        />

        {/* Die Suche steht UNTER den Reitern, nicht darüber. /aktivitaet
            teilt die Reiterleiste, hat aber keine Suche — stand sie oben,
            sprang die Leiste beim Wechsel zwischen "Folge ich" und
            "Aktivität" um die Höhe des Suchfelds nach oben, genau unter dem
            Finger, der gerade getippt hatte. */}
        <ProfileSearch />

        {feed.length === 0 ? (
          <EmptyState
            // Der globale Feed ist die eine Stelle, an der "leer" nicht
            // heisst, dass dem Nutzer etwas fehlt, sondern dass Strado selbst
            // noch nichts hat — dort steht die Marke. Beim Folgen-Feed fehlen
            // dagegen die Fahrten bestimmter Leute, und das sagt das
            // Feed-Icon besser als das Logo.
            icon={scope === "following" ? Rss : Signet}
            title={
              scope === "following"
                ? "Von den Fahrern, denen du folgst, kam noch nichts."
                : "Hier ist es noch ruhig. Fahr eine Runde, dann nicht mehr."
            }
            action={
              scope === "following" ? (
                <Link href="/feed" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Alle Fahrten ansehen
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {feed.map((item) => (
              // Die ganze Karte öffnet die Fahrt, ohne sie in einen <Link> zu
              // packen: darin lägen Profil-Links und der Kudos-Button, und
              // verschachtelte Links sind kein gültiges HTML. Stattdessen
              // dehnt der Titel-Link sein ::after über die Karte ("stretched
              // link"); Avatar, Name und Kudos liegen mit z-10 darüber und
              // bleiben eigenständig klickbar. has-[a:active] ist das
              // Tippen-Feedback für Touch — Hover gibt es dort nicht, und
              // das Tap-Highlight ist global abgeschaltet (globals.css).
              // Bewusst an den gedrückten Link gebunden statt an die Karte:
              // so färbt sich die Karte beim Tippen auf die Fahrt oder das
              // Profil, nicht aber beim Kudos-Button, der eine eigene
              // Rückmeldung hat.
              <Card
                as="li"
                key={item.completion_id}
                className="group relative overflow-hidden transition-colors duration-fast hover:border-border-strong has-[a:active]:bg-surface"
              >
                {/* Zwei Zeilen statt vier. Vorher trug die Karte Fahrer mit
                    Avatar und Datum, dann Titel mit Distanz, dann Region mit
                    Art-Chip, dann Kudos in einer eigenen rechtsbündigen
                    Zeile — auf 390 px passten damit rund zwei Fahrten auf
                    einen Schirm. Schritt 9 des Kernloops lebt aber davon,
                    wie viele fremde Fahrten auf einen Blick passen.

                    Und die erste Zeile trug den NAMEN DES FAHRERS. AGENTS.md
                    nennt den Ortsnamen "the unit of recognition": er ist das,
                    woran jemand seine Strasse wiedererkennt und weshalb er
                    weiterschaut. Er steht jetzt zuerst; Fahrer, Region und
                    Distanz bilden die Zeile darunter.
                    Siehe docs/design-vereinfachung.md, Anhang B5. */}
                <div className="flex items-center gap-3 p-4">
                  <Link href={`/fahrer/${item.user_id}`} className="relative z-10 shrink-0">
                    <Avatar url={item.avatar_url} name={item.display_name} size={40} />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`/fahrten/${item.completion_id}`}
                      className="flex items-baseline gap-2 transition-colors duration-fast hover:text-accent after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent/40"
                    >
                      <span className="min-w-0 truncate text-base font-medium">
                        {item.art === "frei"
                          ? freieFahrtTitel(item.titel, item.start_ort)
                          : item.route_name}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted transition-transform duration-fast group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>

                    {/* Fahrer, Region, Distanz in einer Zeile. Der Fahrername
                        bleibt eigenständig anklickbar (z-10 über dem
                        gestreckten Link der Karte), steht aber nicht mehr
                        vor dem Ortsnamen. Freie Fahrten tragen ihre
                        Kennzeichnung hier statt in einer eigenen Zeile —
                        sie führen über keine geprüfte Strecke, und das soll
                        sichtbar bleiben. */}
                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-muted">
                      <Link
                        href={`/fahrer/${item.user_id}`}
                        className="relative z-10 shrink-0 transition-colors duration-fast hover:text-foreground"
                      >
                        {item.display_name ?? "Fahrer"}
                      </Link>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.region}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {(item.distanz_km ?? item.laenge_km ?? 0).toFixed(1)} km
                      </span>
                      <span aria-hidden="true">·</span>
                      {/* Kurzform ohne Jahr: der Feed ist nach Datum
                          sortiert, das Jahr trägt auf zehn sichtbaren
                          Einträgen nichts bei und kostet vier Zeichen in
                          einer Zeile, die auf 390 px ohnehin knapp ist.
                          <time> statt <span>, damit das vollständige Datum
                          für Hilfstechnik und Suchmaschinen erhalten bleibt. */}
                      <time
                        dateTime={item.datum}
                        className="tabular-nums"
                        title={new Date(item.datum).toLocaleDateString("de-CH")}
                      >
                        {new Date(item.datum).toLocaleDateString("de-CH", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </time>
                      {item.art === "frei" && (
                        <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-xs">
                          Freie Fahrt
                        </span>
                      )}
                    </p>
                  </div>

                  {user && (
                    <div className="relative z-10 shrink-0">
                      <KudosButton
                        completionId={item.completion_id}
                        initialCount={item.kudos.count}
                        initialGiven={item.kudos.givenByMe}
                      />
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </ul>
        )}
        </Seitenrahmen>
      </div>
      </PullToRefreshArea>
    </div>
  );
}
