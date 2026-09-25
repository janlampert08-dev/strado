import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { istCreator } from "@/lib/creatorKennzahlen";
import { getUnseenActivityCount } from "@/lib/aktivitaetsliste";
import { getNavItems } from "@/lib/nav";
import BackButton from "@/components/BackButton";
import LogoLink from "@/components/LogoLink";
import HeaderNavLink from "@/components/HeaderNavLink";
import BottomNav from "@/components/BottomNav";
import SprungZumInhalt from "@/components/SprungZumInhalt";
import OffeneAufzeichnungStreifen from "@/components/OffeneAufzeichnung";
import { buttonVariants } from "@/components/ui/Button";

export default async function Header({ back }: { back?: string } = {}) {
  const user = await getCurrentUser();

  // ungeseheneAktivitaet ist der Rückkanal für "Community reagiert" im
  // Kernloop (siehe AGENTS.md, "Core User Loop") — ohne diesen Zähler
  // erfährt der Fahrer sonst nie aktiv, dass eine geteilte Fahrt Kudos
  // bekommen hat oder ihm jemand neu folgt (0100: eine Zahl, ein RPC, weil
  // dieser Kopf auf jeder Seite läuft).
  // Zeigt sich als Zahl am Feed-Eintrag, in der Textleiste wie in der
  // BottomNav — deshalb hier zentral angestossen statt separat je Surface.
  // Am Feed und nicht an der Aktivität selbst, weil die Aktivität seit dem
  // Leisten-Tausch ein Reiter des Feeds ist und keinen eigenen Eintrag mehr
  // hat (lib/nav.ts). Die Zahl wandert damit an den Ort, von dem aus man
  // hinkommt — was sie besser macht als vorher, nicht schlechter: sie steht
  // jetzt neben etwas, das man ohnehin öffnet.
  //
  // Angestossen, aber nicht erwartet. <Header /> ist ein Kind der Seite und
  // läuft erst nach deren eigenen Abfragen; wartete er hier auf Zähler,
  // Moderator- und Creator-Status, hinge an jeder Seite ein weiterer
  // Roundtrip, bevor irgendetwas ausgeliefert wird. Stattdessen streamen die
  // Navigation im Kopf und der Feed-Tab unten in eigenen Suspense-Grenzen
  // nach, der Rest der Seite geht sofort raus. Alle drei Abfragen sind per
  // cache() pro Request memoisiert (isModerator, eigeneCodes hinter
  // istCreator, getUnseenActivityCount), die beiden Stellen teilen sich also
  // dieselbe Abfrage.
  //
  // .catch: das Promise geht an eine Client-Komponente (BottomNav, dort
  // use()). Ein Fehler soll höchstens die Zahl kosten, nicht die Seite —
  // getUnseenActivityCount fängt Abfragefehler schon selbst ab, das hier
  // deckt den Rest (z.B. createClient).
  const ungeseheneAktivitaet = user
    ? getUnseenActivityCount().catch(() => 0)
    : undefined;

  return (
    <>
      {/* Erstes fokussierbares Element jeder Seite — siehe
          components/SprungZumInhalt.tsx. */}
      <SprungZumInhalt />
      {/* sticky + Transluzenz/Blur statt eines deckenden Balkens — das
          "durchscheinende", beim Scrollen fixierte Nav-Bar-Verhalten ist ein
          der auffälligsten iOS-Systemmuster (Safari, Mail, Einstellungen). */}
      {/* pt rechnet den oberen sicheren Bereich mit ein. Die App laeuft
          installiert im Vollbild (manifest display: "standalone") mit
          statusBarStyle "black-translucent" und viewport-fit=cover — die
          Seite beginnt dort also bei y=0, unter Uhrzeit, Batterie und Notch.
          Ohne diesen Zuschlag lag der Kopfinhalt darunter: die Wortmarke
          begann 12px unter der Oberkante, der Notch reicht auf einem
          iPhone 13 bis 47px.

          Im Browser ist var(--safe-top) 0 — dort belegt Safaris eigene
          Leiste den Streifen —, die Zeile aendert also nur den
          installierten Fall. top-0 bleibt mit Absicht: unter einer
          durchscheinenden Statusleiste soll der unscharfe Hintergrund des
          Kopfes bis nach oben laufen, statt die scrollende Seite
          durchscheinen zu lassen.

          Die Bottom-Nav macht dasselbe seit jeher fuer --safe-bottom; nur
          oben fehlte es. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3 backdrop-blur-xl sm:px-6 sm:pt-[calc(1rem+var(--safe-top))] sm:pb-4">
        {/* min-h-8: der Zurück-Knopf ist 30 px hoch, die Wortmarke 18 px. Ohne
            Mindesthöhe war der Kopf auf /feed 55 px hoch und auf /profil 43 —
            beim Wechseln der Tabs sprang der Inhalt darunter. */}
        <div className="flex min-h-8 min-w-0 items-center gap-3 sm:gap-4">
          {back && <BackButton fallbackHref={back} />}
          {/* Die Wortmarke ist eine Kontur (lib/marke.ts), kein gesetzter
              Text. Klassen und Grösse stecken jetzt in LogoLink.tsx: der Link
              braucht einen Client-Anteil für das Antipp-Feedback (auf Touch
              gibt es keinen Hover) und dafür, auf der Startseite statt einer
              wirkungslosen Navigation eine zufällige Strecke vorzuschlagen. */}
          <LogoLink />
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          {/* Auf Mobile übernimmt BottomNav die Navigation — diese Textleiste
              bleibt nur auf Desktop sichtbar, um die Tab-Leiste nicht zu
              duplizieren. Die Hell/Dunkel-Wahl (vormals hier als eigenes
              Icon) wohnt jetzt ausschliesslich im Darstellung-Tab der
              Einstellungen (app/profil/einstellungen); ohne manuelle Wahl
              gilt weiterhin "System" als Standard. */}
          {user && ungeseheneAktivitaet ? (
            // Platzhalter: dieselbe Leiste ohne Rollen-Einträge und ohne
            // Zahl. Für die allermeisten Konten (weder Creator noch
            // Moderator) ändert sich beim Nachrücken nur die Zahl am Feed.
            <Suspense fallback={<KopfNavigation loggedIn moderator={false} creator={false} ungeseheneAktivitaet={0} />}>
              <KopfNavigationMitRollen userId={user.id} ungeseheneAktivitaet={ungeseheneAktivitaet} />
            </Suspense>
          ) : (
            <KopfNavigation loggedIn={false} moderator={false} creator={false} ungeseheneAktivitaet={0} />
          )}
        </div>
      </header>
      {/* Nicht im sticky-Kopf, sondern darunter im Fluss: der Streifen ist
          ein Hinweis beim Ankommen auf einer Seite, kein dauerhafter Teil
          der Navigation, und der Kopf soll auf jeder Seite gleich hoch
          bleiben. Die Leiste unten trägt dasselbe Signal am Tab. */}
      <OffeneAufzeichnungStreifen userId={user?.id ?? null} />
      <BottomNav
        userId={user?.id ?? null}
        loggedIn={!!user}
        ungeseheneAktivitaet={ungeseheneAktivitaet}
      />
    </>
  );
}

async function KopfNavigationMitRollen({
  userId,
  ungeseheneAktivitaet,
}: {
  userId: string;
  ungeseheneAktivitaet: Promise<number>;
}) {
  // Drei Abfragen, die nur an userId hängen und nicht aneinander — also
  // nebenläufig. istCreator ist ein Existenz-Check auf creator_links (0091),
  // für die allermeisten Konten ohne eine einzige Zeile.
  const [moderator, creator, zaehler] = await Promise.all([
    isModerator(userId),
    istCreator(userId),
    ungeseheneAktivitaet,
  ]);
  return (
    <KopfNavigation loggedIn moderator={moderator} creator={creator} ungeseheneAktivitaet={zaehler} />
  );
}

function KopfNavigation({
  loggedIn,
  moderator,
  creator,
  ungeseheneAktivitaet,
}: {
  loggedIn: boolean;
  moderator: boolean;
  creator: boolean;
  ungeseheneAktivitaet: number;
}) {
  // "/" wird hier ausgelassen — das Logo verlinkt bereits dorthin, ein
  // zweiter Link wäre redundant. Einzige Quelle der Nav-Items: lib/nav.ts,
  // von BottomNav (Mobile) genauso genutzt.
  const items = getNavItems({ loggedIn, moderator, creator }).filter(
    (item) => item.href !== "/",
  );
  return (
    <nav className="hidden items-center gap-3 overflow-x-auto reiter-scroller text-sm sm:gap-6 md:flex">
      {items.map((item) =>
        item.href === "/anmelden" ? (
          <Link
            key={item.href}
            href={item.href}
            className={buttonVariants({ variant: "primary", size: "sm", className: "whitespace-nowrap" })}
          >
            {item.label}
          </Link>
        ) : (
          <HeaderNavLink
            key={item.href}
            href={item.href}
            aktivAuf={item.aktivAuf}
            // Der Zähler hängt am Feed: dort liegt die Aktivität als
            // Reiter (components/FeedReiter.tsx), und die Zahl gehört
            // an den Eintrag, der dorthin führt.
            ariaLabel={
              item.href === "/feed" && ungeseheneAktivitaet > 0
                ? `${item.label}, ${ungeseheneAktivitaet} ${ungeseheneAktivitaet === 1 ? "neue Reaktion" : "neue Reaktionen"}`
                : undefined
            }
          >
            {item.label}
            {item.href === "/feed" && ungeseheneAktivitaet > 0 && (
              <span
                aria-hidden="true"
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent"
              >
                {ungeseheneAktivitaet > 9 ? "9+" : ungeseheneAktivitaet}
              </span>
            )}
          </HeaderNavLink>
        ),
      )}
    </nav>
  );
}
