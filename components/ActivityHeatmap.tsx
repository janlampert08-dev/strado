import { buildHeatmapDays, buildHeatmapMonthLabels, WOCHENTAGE_KURZ } from "@/lib/heatmap";

const LEVEL_OPACITY = [1, 0.3, 0.55, 1];

// Kantenlänge einer Tageszelle in px. Die Achsenbeschriftungen richten sich an
// derselben Zahl aus (Zeilenhöhe links, Spaltenraster oben), damit Label und
// Zelle auch dann auf einer Linie bleiben, wenn die Schriftgrösse wächst.
const ZELLE_PX = 10;

function levelFor(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

export default function ActivityHeatmap({ dates }: { dates: string[] }) {
  const days = buildHeatmapDays(dates);
  const monthLabels = buildHeatmapMonthLabels(days);
  const weeks = Math.floor(days.length / WOCHENTAGE_KURZ.length);

  return (
    // w-fit statt voller Breite: die Karte, in der der Graph steckt, ist oft
    // breiter als das Gitter selbst (52 Wochen ≈ 730px) — mit einer vollen
    // Flex-Column-Breite würde "self-end" die Legende an den rechten Rand
    // der ganzen Karte ziehen statt an den rechten Rand des Gitters direkt
    // darüber. w-fit lässt den Wrapper auf die (durch overflow-x-auto ggf.
    // gescrollte) Gitterbreite schrumpfen, sodass die Legende korrekt unter
    // dem sichtbaren Gitter sitzt statt lose weit rechts zu schweben.
    <div className="flex w-fit flex-col gap-2">
      <div className="flex gap-1">
        {/* Wochentage: nur jeder zweite Tag beschriftet, sonst klebt der Text
            bei 10px Zeilenhöhe aufeinander. Die leeren Zellen bleiben
            trotzdem im Raster, damit Mo/Mi/Fr auf ihrer Zeile sitzen. */}
        <div aria-hidden="true" className="flex shrink-0 flex-col gap-1">
          <div style={{ height: ZELLE_PX }} />
          <div className="grid gap-1" style={{ gridTemplateRows: `repeat(7, ${ZELLE_PX}px)` }}>
            {WOCHENTAGE_KURZ.map((tag, i) => (
              <span key={tag} className="text-[10px] leading-[10px] text-muted">
                {i % 2 === 0 && i < 6 ? tag : ""}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex w-max flex-col gap-1">
            {/* Monatsnamen über der Spalte, in der der Monat beginnt. Gleiches
                Spaltenraster wie das Gitter darunter; der Text darf über seine
                10px-Spalte hinausragen, deshalb bleiben die letzten Spalten
                unbeschriftet (siehe buildHeatmapMonthLabels). */}
            <div
              aria-hidden="true"
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${weeks}, ${ZELLE_PX}px)`, height: ZELLE_PX }}
            >
              {monthLabels.map(({ label, weekIndex }) => (
                <span
                  key={`${label}-${weekIndex}`}
                  className="text-[10px] leading-[10px] whitespace-nowrap text-muted"
                  style={{ gridColumnStart: weekIndex + 1 }}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="grid grid-flow-col gap-1" style={{ gridTemplateRows: `repeat(7, ${ZELLE_PX}px)` }}>
              {days.map(({ dateKey, count }) => {
                const level = levelFor(count);
                return (
                  <div
                    key={dateKey}
                    title={`${new Date(dateKey).toLocaleDateString("de-CH", { timeZone: "UTC" })}: ${
                      count === 0 ? "keine Fahrt" : count === 1 ? "1 Fahrt" : `${count} Fahrten`
                    }`}
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{
                      backgroundColor: level === 0 ? "var(--color-border)" : "var(--color-accent)",
                      opacity: LEVEL_OPACITY[level],
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 self-end text-xs text-muted">
        <span>Weniger</span>
        {LEVEL_OPACITY.map((opacity, i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-sm"
            style={{
              backgroundColor: i === 0 ? "var(--color-border)" : "var(--color-accent)",
              opacity,
            }}
          />
        ))}
        <span>Mehr</span>
      </div>
    </div>
  );
}
