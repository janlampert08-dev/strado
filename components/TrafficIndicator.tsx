"use client";

import { CONGESTION_META, type CongestionLevel } from "@/lib/traffic";

export type TrafficChipState = "loading" | "none" | CongestionLevel;

// Rein darstellend: Datenabfrage und Kartenanzeige liegen bei RouteDetailMap
// (einzige Quelle für beides, siehe lib/traffic.ts) — der Chip zeigt nur den
// aktuellen Zustand und schaltet bei Klick dieselbe eingefärbte Strecke auf
// der (ohnehin sichtbaren) Karte um, statt eine eigene, unverbundene
// Textzeile zu sein.
export default function TrafficIndicator({
  state,
  active,
  onToggle,
}: {
  state: TrafficChipState;
  active: boolean;
  onToggle: () => void;
}) {
  if (state === "loading") {
    return (
      <span className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted">
        <span className="h-2 w-2 animate-pulse bg-muted/40" />
        Verkehr wird geladen…
      </span>
    );
  }

  if (state === "none") {
    return (
      <span className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted">
        <span className="h-2 w-2 bg-muted/40" />
        Keine Live-Verkehrsdaten
      </span>
    );
  }

  const meta = CONGESTION_META[state];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? "Verkehr auf der Karte ausblenden" : "Verkehr auf der Karte anzeigen"}
      // Gleiche Höhe und Tippfläche wie die Nachbarknöpfe auf der Karte
      // (RouteDetailMap): 36 px sichtbar, 44 px greifbar.
      className={
        active
          ? "flex items-center gap-2 rounded-full border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-transform duration-fast active:scale-95 relative min-h-9 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
          : "flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-fast hover:border-muted relative min-h-9 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
      }
    >
      <span className="h-2 w-2 shrink-0" style={{ backgroundColor: meta.color }} />
      Verkehr: {meta.label}
    </button>
  );
}
