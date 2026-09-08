import Link from "next/link";
import { Flame } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { getUnseenKudosCount } from "@/lib/kudos";
import { getNavItems } from "@/lib/nav";
import BackButton from "@/components/BackButton";
import LogoLink from "@/components/LogoLink";
import BottomNav from "@/components/BottomNav";
import { buttonVariants } from "@/components/ui/Button";

export default async function Header({ back }: { back?: string } = {}) {
  const user = await getCurrentUser();

  // unseenKudosCount ist der Rückkanal für "Community reagiert" im Kernloop
  // (siehe AGENTS.md, "Core User Loop") — ohne diesen Zähler erfährt der
  // Fahrer sonst nie aktiv, dass eine geteilte Fahrt Kudos bekommen hat.
  // Zeigt sich am Flammen-Icon unten, das auf jeder Bildschirmgrösse
  // sichtbar ist (anders als die reine Text-Nav, die auf Mobile hinter
  // BottomNav zurücktritt) — deshalb hier zentral berechnet statt separat
  // je Surface.
  //
  // Beide Abfragen hängen nur an user, nicht voneinander. Sequenziell waren
  // das zwei Roundtrips hintereinander, und zwar auf jeder Seite: <Header />
  // ist ein Kind der Seite, läuft also ohnehin erst nach deren eigenen
  // Abfragen.
  const [moderator, unseenKudosCount] = await Promise.all([
    user ? isModerator(user.id) : Promise.resolve(false),
    user ? getUnseenKudosCount() : Promise.resolve(0),
  ]);
  // "/" wird hier ausgelassen — das Logo verlinkt bereits dorthin, ein
  // zweiter Link wäre redundant. Einzige Quelle der Nav-Items: lib/nav.ts,
  // von BottomNav (Mobile) genauso genutzt.
  const items = getNavItems({ loggedIn: !!user, moderator }).filter((item) => item.href !== "/");

  return (
    <>
      {/* sticky + Transluzenz/Blur statt eines deckenden Balkens — das
          "durchscheinende", beim Scrollen fixierte Nav-Bar-Verhalten ist ein
          der auffälligsten iOS-Systemmuster (Safari, Mail, Einstellungen). */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
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
              aria-label={
                unseenKudosCount > 0
                  ? `Aktivität, ${unseenKudosCount} ${unseenKudosCount === 1 ? "neues Kudo" : "neue Kudos"}`
                  : "Aktivität"
              }
              className="relative flex items-center justify-center rounded-full p-1.5 text-foreground transition-colors duration-fast hover:text-accent"
            >
              <Flame className="h-5 w-5" aria-hidden="true" />
              {unseenKudosCount > 0 && (
                <span aria-hidden="true" className="absolute top-0 right-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-background">
                  {unseenKudosCount > 9 ? "9+" : unseenKudosCount}
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
      <BottomNav loggedIn={!!user} moderator={moderator} />
    </>
  );
}
