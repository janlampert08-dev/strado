"use client";

import { Children, useState, type ReactNode } from "react";
import {
  segmentClassName,
  segmentHuelleClassName,
} from "@/components/ui/SegmentedControl";

export interface AbschnittTab {
  titel: string;
  /** Optionale Zahl rechts vom Titel (z. B. Fahrten, Fahrzeuge). */
  anzahl?: number;
}

// Die Reiterleiste für gestapelte Seiten — das Strava-Muster: nebeneinander
// statt untereinander. Eine Seite, ein Thema je Reiter, der Rest ist einen
// Tipp entfernt statt drei Bildschirmhöhen.
//
// Bewusst lokaler State statt URL-Parameter: die Reiter sind Ansichten
// derselben Seite (wie /feed seine drei Reiten eine Frage nennen), keine
// eigenen Adressen. Kinder sind Panels in derselben Reihenfolge wie `tabs`;
// gezeigt wird genau eines, in `role="tabpanel"`.
//
// Nicht sticky (Eigentümerentscheid): Die Leiste war der
// Orientierungsanker beim Tiefscrollen, blieb dafür aber auf jeder Seite
// an ihrer Position kleben. Wer sie braucht, scrollt zurück — sie scrollt
// mit dem Inhalt mit, statt darüber zu schweben.
export default function AbschnittTabs({
  tabs,
  children,
  start = 0,
}: {
  tabs: AbschnittTab[];
  children: ReactNode;
  /** Welcher Reiter initial offen ist (z. B. nach Kontext). */
  start?: number;
}) {
  const panels = Children.toArray(children);
  const [aktiv, setAktiv] = useState(() => Math.min(Math.max(start, 0), tabs.length - 1));

  return (
    <div className="flex flex-col gap-3">
      {/* Dieselbe Hülle wie der Feed-Reiter (FeedReiter.tsx): eine Leiste,
          ein Stil — egal ob die Reiter Adressen oder Ansichten schalten. */}
      <div
        role="tablist"
        aria-label="Abschnitte dieser Seite"
        className={segmentHuelleClassName("overflow-x-auto reiter-scroller")}
      >
        {tabs.map((tab, i) => {
            const istAktiv = aktiv === i;
            return (
              <button
                key={tab.titel}
                type="button"
                role="tab"
                aria-selected={istAktiv}
                onClick={() => setAktiv(i)}
                className={segmentClassName(istAktiv)}
              >
                {tab.titel}
                {tab.anzahl !== undefined && (
                  <span
                    aria-hidden="true"
                    className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                      istAktiv ? "bg-background text-foreground" : "bg-accent text-background"
                    }`}
                  >
                    {tab.anzahl > 99 ? "99+" : tab.anzahl}
                  </span>
                )}
              </button>
            );
          })}
      </div>
      <div role="tabpanel">{panels[aktiv]}</div>
    </div>
  );
}
