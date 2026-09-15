import Link from "next/link";
import { Flame } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { istCreator } from "@/lib/creatorKennzahlen";
import { getUnseenActivityCount } from "@/lib/aktivitaetsliste";
import { getNavItems } from "@/lib/nav";
import BackButton from "@/components/BackButton";
import LogoLink from "@/components/LogoLink";
import BottomNav from "@/components/BottomNav";
import { buttonVariants } from "@/components/ui/Button";

export default async function Header({ back }: { back?: string } = {}) {
  const user = await getCurrentUser();

  // ungeseheneAktivitaet ist der Rückkanal für "Community reagiert" im
  // Kernloop (siehe AGENTS.md, "Core User Loop") — ohne diesen Zähler
  // erfährt der Fahrer sonst nie aktiv, dass eine geteilte Fahrt Kudos
  // bekommen hat oder ihm jemand neu folgt (0097: eine Zahl, ein RPC, weil
  // dieser Kopf auf jeder Seite läuft).
  // Zeigt sich am Flammen-Icon unten, das auf jeder Bildschirmgrösse
  // sichtbar ist (anders als die reine Text-Nav, die auf Mobile hinter
  // BottomNav zurücktritt) — deshalb hier zentral berechnet statt separat
  // je Surface.
  //
  // Beide Abfragen hängen nur an user, nicht voneinander. Sequenziell waren
  // das zwei Roundtrips hintereinander, und zwar auf jeder Seite: <Header />
  // ist ein Kind der Seite, läuft also ohnehin erst nach deren eigenen
  // Abfragen.
  // Drei Abfragen, die nur an user hängen und nicht aneinander — also
  // nebenläufig. Die dritte kam mit den Creator-Konten dazu (0091): sie ist
  // ein Existenz-Check mit limit(1) auf einer Tabelle, die für die
  // allermeisten Konten keine einzige Zeile hat, und wie isModerator pro
  // Request memoisiert.
  const [moderator, creator, ungeseheneAktivitaet] = await Promise.all([
    user ? isModerator(user.id) : Promise.resolve(false),
    user ? istCreator(user.id) : Promise.resolve(false),
    user ? getUnseenActivityCount() : Promise.resolve(0),
  ]);
  // "/" wird hier ausgelassen — das Logo verlinkt bereits dorthin, ein
  // zweiter Link wäre redundant. Einzige Quelle der Nav-Items: lib/nav.ts,
  // von BottomNav (Mobile) genauso genutzt.
  const items = getNavItems({ loggedIn: !!user, moderator, creator }).filter(
    (item) => item.href !== "/",
  );

  return (
    <>
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
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {back && <BackButton fallbackHref={back} />}
          {/* Die Wortmarke ist eine Kontur (lib/marke.ts), kein gesetzter
              Text. Klassen und Grösse stecken jetzt in LogoLink.tsx: der Link
              braucht einen Client-Anteil für das Antipp-Feedback (auf Touch
              gibt es keinen Hover) und dafür, auf der Startseite statt einer
              wirkungslosen Navigation eine zufällige Strecke vorzuschlagen. */}
          <LogoLink />
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          {/* Eigener Icon-Link statt eines Nav-Eintrags: liegt hier
              ausserhalb des "hidden md:flex"-Blocks unten und bleibt damit
              auch auf Mobile sichtbar, wo BottomNav die Textnavigation
              ersetzt — Instagram-artige Platzierung oben rechts statt eines
              siebten/sechsten BottomNav-Tabs (siehe lib/nav.ts, dort schon
              als zu eng bewertet). */}
          {user && (
            <Link
              href="/aktivitaet"
              // aria-label ersetzt den Inhalt vollständig — mit dem festen Text
              // "Aktivität" war der Zähler für Screenreader nicht vorhanden.
              // Genau dieser Zähler ist Schritt 8 des Kernloops.
              // Neutral formuliert, seit der Zähler zwei Arten von
              // Reaktion zusammenfasst (Kudos und neue Follower, 0097):
              // "3 neue Kudos" wäre schlicht falsch, sobald ein Follower
              // mitzählt, und die Zahl nach Art aufzuschlüsseln hiesse zwei
              // Zahlen zu laden, wo eine reicht.
              aria-label={
                ungeseheneAktivitaet > 0
                  ? `Aktivität, ${ungeseheneAktivitaet} ${ungeseheneAktivitaet === 1 ? "neue Reaktion" : "neue Reaktionen"}`
                  : "Aktivität"
              }
              className="relative flex items-center justify-center rounded-full p-1.5 text-foreground transition-colors duration-fast hover:text-accent"
            >
              <Flame className="h-5 w-5" aria-hidden="true" />
              {ungeseheneAktivitaet > 0 && (
                <span aria-hidden="true" className="absolute top-0 right-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-background">
                  {ungeseheneAktivitaet > 9 ? "9+" : ungeseheneAktivitaet}
                </span>
              )}
            </Link>
          )}
          {/* Auf Mobile übernimmt BottomNav die Navigation — diese Textleiste
              bleibt nur auf Desktop sichtbar, um die Tab-Leiste nicht zu
              duplizieren. Die Hell/Dunkel-Wahl (vormals hier als eigenes
              Icon) wohnt jetzt ausschliesslich im Darstellung-Tab der
              Einstellungen (app/profil/einstellungen); ohne manuelle Wahl
              gilt weiterhin "System" als Standard. */}
          <nav className="hidden items-center gap-3 overflow-x-auto text-sm sm:gap-6 md:flex">
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
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 whitespace-nowrap text-foreground transition-colors duration-fast hover:text-accent"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      </header>
      <BottomNav loggedIn={!!user} moderator={moderator} creator={creator} />
    </>
  );
}
