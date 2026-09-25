"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavItems, type NavItem } from "@/lib/nav";
import { useOffeneAufzeichnung } from "@/components/OffeneAufzeichnung";

// Nur auf schmalen Viewports sichtbar (md:hidden) — ersetzt dort die
// horizontale Header-Navigation durch die auf iOS/Strava übliche fixierte
// Bottom-Tab-Bar. safe-area-Padding unten, damit sie auf iPhones mit
// Home-Indicator nicht daran klebt (siehe viewport-fit=cover in layout.tsx).
export default function BottomNav({
  userId = null,
  loggedIn,
  ungeseheneAktivitaet,
}: {
  /** Nur für den Hinweis am Tab "Fahrt starten", ob eine Aufzeichnung dieses
   *  Kontos offen im Browser liegt (components/OffeneAufzeichnung.tsx). */
  userId?: string | null;
  loggedIn: boolean;
  /** Ungesehene Kudos und neue Follower (0100). Sitzt am Feed-Eintrag:
   *  die Aktivität ist ein Reiter des Feeds (components/FeedReiter.tsx)
   *  und hat keinen eigenen Tab mehr, die Zahl gehört also an den Tab, der
   *  dorthin führt.
   *
   *  Als Promise statt als Zahl: <Header /> wartet nicht mehr auf die
   *  Abfrage, bevor die Seite ausgeliefert wird. Nur der Feed-Tab wartet
   *  darauf, in einer eigenen Suspense-Grenze — bis dahin steht er ohne
   *  Zahl da. Der Zähler sitzt absolut positioniert am Symbol, sein
   *  Nachrücken verschiebt also nichts. Die übrige Leiste bleibt dabei
   *  montiert (useOffeneAufzeichnung liest nicht neu). */
  ungeseheneAktivitaet?: Promise<number>;
}) {
  const pathname = usePathname();
  // Creator und Moderation führt die Leiste unten nicht (lib/nav.ts,
  // surface "bottom") — die Rollen spielen hier also keine Rolle.
  const tabs = getNavItems({ loggedIn, moderator: false, surface: "bottom" });
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
          // Der rote Punkt am Aufnahme-Tab: eine Fahrt liegt offen. Er sitzt
          // an dem Eintrag, der sie ausgelöst hat, auch wenn der Weg zurück
          // bei einer Streckenfahrt über die Streckenseite führt — dorthin
          // zeigt der Streifen unter dem Kopf.
          const aufzeichnungsHinweis =
            tab.href === "/fahrten/neu" && offeneAufzeichnung !== null
              ? offeneAufzeichnung.phase === "tracking"
                ? "Aufzeichnung unterbrochen"
                : "Fahrt noch nicht gespeichert"
              : null;

          if (tab.href === "/feed" && ungeseheneAktivitaet) {
            return (
              <Suspense key={tab.href} fallback={<Tab tab={tab} active={active} zaehler={0} aufzeichnungsHinweis={null} />}>
                <TabMitZaehler tab={tab} active={active} zaehler={ungeseheneAktivitaet} />
              </Suspense>
            );
          }
          return (
            <Tab
              key={tab.href}
              tab={tab}
              active={active}
              zaehler={0}
              aufzeichnungsHinweis={aufzeichnungsHinweis}
            />
          );
        })}
      </div>
    </nav>
  );
}

function TabMitZaehler({
  tab,
  active,
  zaehler,
}: {
  tab: NavItem;
  active: boolean;
  zaehler: Promise<number>;
}) {
  return <Tab tab={tab} active={active} zaehler={use(zaehler)} aufzeichnungsHinweis={null} />;
}

function Tab({
  tab,
  active,
  zaehler,
  aufzeichnungsHinweis,
}: {
  tab: NavItem;
  active: boolean;
  zaehler: number;
  aufzeichnungsHinweis: string | null;
}) {
  const Icon = tab.icon;
  const zeigtZaehler = zaehler > 0;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      aria-label={
        aufzeichnungsHinweis
          ? `${tab.label}, ${aufzeichnungsHinweis}`
          : zeigtZaehler
          ? `${tab.label}, ${zaehler} ${zaehler === 1 ? "neue Reaktion" : "neue Reaktionen"}`
          : undefined
      }
      className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium"
    >
      <span className="relative">
        <Icon
          className={`h-6 w-6 transition-colors duration-fast ${active ? "text-accent-ink" : "text-muted"}`}
        />
        {aufzeichnungsHinweis && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-background"
          />
        )}
        {zeigtZaehler && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent"
          >
            {zaehler > 9 ? "9+" : zaehler}
          </span>
        )}
      </span>
      {/* whitespace-nowrap + tracking-tight: "Fahrt starten" brach mit Geist
          auf 360 px in zwei Zeilen (Re-Audit 2026-09-23). Der Name bleibt —
          er ist bewusst nach der Absicht gewählt (lib/nav.test.ts). */}
      <span className={`whitespace-nowrap tracking-tight transition-colors duration-fast ${active ? "text-accent-ink" : "text-muted"}`}>
        {tab.label}
      </span>
    </Link>
  );
}
