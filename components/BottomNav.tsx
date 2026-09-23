"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavItems } from "@/lib/nav";
import { useOffeneAufzeichnung } from "@/components/OffeneAufzeichnung";

// Nur auf schmalen Viewports sichtbar (md:hidden) — ersetzt dort die
// horizontale Header-Navigation durch die auf iOS/Strava übliche fixierte
// Bottom-Tab-Bar. safe-area-Padding unten, damit sie auf iPhones mit
// Home-Indicator nicht daran klebt (siehe viewport-fit=cover in layout.tsx).
export default function BottomNav({
  userId = null,
  loggedIn,
  moderator,
  creator = false,
  ungeseheneAktivitaet = 0,
}: {
  /** Nur für den Hinweis am Tab "Fahrt starten", ob eine Aufzeichnung dieses
   *  Kontos offen im Browser liegt (components/OffeneAufzeichnung.tsx). */
  userId?: string | null;
  loggedIn: boolean;
  moderator: boolean;
  creator?: boolean;
  /** Ungesehene Kudos und neue Follower (0100). Sitzt am Feed-Eintrag:
   *  die Aktivität ist ein Reiter des Feeds (components/FeedReiter.tsx)
   *  und hat keinen eigenen Tab mehr, die Zahl gehört also an den Tab, der
   *  dorthin führt. */
  ungeseheneAktivitaet?: number;
}) {
  const pathname = usePathname();
  const tabs = getNavItems({ loggedIn, moderator, creator, surface: "bottom" });
  const offeneAufzeichnung = useOffeneAufzeichnung(userId);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 pb-[var(--safe-bottom)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "max(var(--safe-bottom), 0px)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map((tab) => {
          // "/" nur exakt — sonst wäre es auf jeder Seite aktiv. Alle
          // übrigen per Präfix, plus die Pfade aus aktivAuf (lib/nav.ts):
          // /aktivitaet ist ein Reiter des Feeds und deshalb kein Präfix
          // eines Eintrags.
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href) ||
                (tab.aktivAuf?.some((p) => pathname.startsWith(p)) ?? false);
          const Icon = tab.icon;
          const zeigtZaehler = tab.href === "/feed" && ungeseheneAktivitaet > 0;
          // Der rote Punkt am Aufnahme-Tab: eine Fahrt liegt offen. Er sitzt
          // an dem Eintrag, der sie ausgelöst hat, auch wenn der Weg zurück
          // bei einer Streckenfahrt über die Streckenseite führt — dorthin
          // zeigt der Streifen unter dem Kopf.
          const zeigtAufzeichnung = tab.href === "/fahrten/neu" && offeneAufzeichnung !== null;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              aria-label={
                zeigtAufzeichnung
                  ? `${tab.label}, ${offeneAufzeichnung?.phase === "tracking" ? "Aufzeichnung unterbrochen" : "Fahrt noch nicht gespeichert"}`
                  : zeigtZaehler
                  ? `${tab.label}, ${ungeseheneAktivitaet} ${ungeseheneAktivitaet === 1 ? "neue Reaktion" : "neue Reaktionen"}`
                  : undefined
              }
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium"
            >
              <span className="relative">
                <Icon
                  className={`h-6 w-6 transition-colors duration-fast ${active ? "text-accent" : "text-muted"}`}
                />
                {zeigtAufzeichnung && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-background"
                  />
                )}
                {zeigtZaehler && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-background"
                  >
                    {ungeseheneAktivitaet > 9 ? "9+" : ungeseheneAktivitaet}
                  </span>
                )}
              </span>
              {/* whitespace-nowrap + tracking-tight: "Fahrt starten" brach mit Geist
                  auf 360 px in zwei Zeilen (Re-Audit 2026-09-23). Der Name bleibt —
                  er ist bewusst nach der Absicht gewählt (lib/nav.test.ts). */}
              <span className={`whitespace-nowrap tracking-tight transition-colors duration-fast ${active ? "text-accent" : "text-muted"}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
