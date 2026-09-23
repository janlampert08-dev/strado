import Link from "next/link";
import { Route as RouteIcon, Timer } from "@/components/NavIcons";
import RideVisibilityToggle from "@/components/RideVisibilityToggle";
import { formatDauer } from "@/lib/format";
import type { DetectedSegment } from "@/lib/completions";
import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";

// Innerhalb dieser freien Fahrt automatisch erkannte Streckenabschnitte
// (lib/lapDetection.ts) — nur dem Besitzer sichtbar, siehe getDetectedSegments
// in lib/completions.ts. Jede Zeile ist eine eigenständige Fahrt (eigener
// route_completions-Eintrag) mit eigenem Sichtbarkeits-Toggle, exakt wie eine
// regulär über die Streckenseite gestartete Streckenfahrt — gleiche Zeilen-
// Optik wie "Getrackte Fahrten" im Profil (app/profil/page.tsx).
export default function DetectedSegmentsCard({ segments }: { segments: DetectedSegment[] }) {
  if (segments.length === 0) return null;

  return (
    <Card surface className="flex flex-col gap-3 p-4">
      <SectionHeading as="p" groesse="xs" icon={RouteIcon}>
        Auf dieser Fahrt erkannt
      </SectionHeading>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
        {segments.map((segment) => {
          const avgKmh =
            segment.dauerSekunden && segment.dauerSekunden > 0 && segment.distanzKm
              ? segment.distanzKm / (segment.dauerSekunden / 3600)
              : null;
          return (
            <li key={segment.id} className="group transition-colors duration-fast hover:bg-surface druckbar">
              <div className="flex items-center justify-between gap-3 p-3">
                <Link
                  href={`/fahrten/${segment.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1"
                >
                  <span className="min-w-0 truncate font-medium transition-colors duration-fast group-hover:text-accent">
                    {segment.routeName}
                  </span>
                  <div className="flex items-center gap-2 text-xs tabular-nums text-muted">
                    <span>{(segment.distanzKm ?? 0).toFixed(1)} km</span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1">
                      <Timer className="h-3 w-3" aria-hidden="true" />
                      {segment.dauerSekunden !== null ? formatDauer(segment.dauerSekunden) : "—"}
                    </span>
                    {avgKmh !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{avgKmh.toFixed(0)} km/h</span>
                      </>
                    )}
                  </div>
                </Link>
                <RideVisibilityToggle
                  completionId={segment.id}
                  isPublic={segment.istOeffentlich}
                  coveragePercent={segment.abdeckungProzent}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
