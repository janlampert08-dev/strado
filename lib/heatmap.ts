export const HEATMAP_WEEKS = 18;
const DAYS_PER_WEEK = 7;

export interface HeatmapDay {
  dateKey: string; // "YYYY-MM-DD"
  count: number;
}

// Alles in UTC gerechnet (nicht Server-Lokalzeit): route_completions.datum
// ist eine reine Postgres-date-Spalte ohne Zeitzone, von PostgREST als
// "YYYY-MM-DD" serialisiert — .toISOString().slice(0,10) auf einem
// UTC-Mitternacht-Date liefert exakt dasselbe Format zum Abgleich, ohne dass
// die Zeitzone des Server-Prozesses die Kalendertage verschiebt.
export function buildHeatmapDays(
  dates: string[],
  { weeks = HEATMAP_WEEKS, referenceDate = new Date() }: { weeks?: number; referenceDate?: Date } = {},
): HeatmapDay[] {
  const countByDate = new Map<string, number>();
  for (const raw of dates) {
    const key = raw.slice(0, 10);
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
  }

  const today = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
  );
  const todayWeekday = (today.getUTCDay() + 6) % 7; // 0 = Montag

  const gridEnd = new Date(today);
  gridEnd.setUTCDate(today.getUTCDate() + (6 - todayWeekday));

  const totalDays = weeks * DAYS_PER_WEEK;
  const gridStart = new Date(gridEnd);
  gridStart.setUTCDate(gridEnd.getUTCDate() - totalDays + 1);

  return Array.from({ length: totalDays }, (_, i) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + i);
    const dateKey = date.toISOString().slice(0, 10);
    return { dateKey, count: countByDate.get(dateKey) ?? 0 };
  });
}

export interface HeatmapMonthLabel {
  label: string; // "Mär"
  weekIndex: number; // Spalte im Gitter, 0-basiert
}

// Kurze Monatsnamen fix statt über toLocaleDateString: der Graph wird auf dem
// Server gerendert, und dessen ICU-Daten sind nicht garantiert dieselben wie
// im Browser — ein hartkodiertes Array hält die Beschriftung deterministisch.
const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Beschriftet die Spalte, in der ein neuer Monat beginnt. Gemessen wird am
// Montag der Woche, also an derselben Zelle, an der die Spalte optisch
// anfängt. Die erste Spalte bekommt nur dann ein Label, wenn sie tatsächlich
// am Monatsanfang steht — sonst stünde dort ein Monatsname über einer Spalte,
// die grösstenteils zum Vormonat gehört.
export function buildHeatmapMonthLabels(
  days: HeatmapDay[],
  { minWeekGap = 3 }: { minWeekGap?: number } = {},
): HeatmapMonthLabel[] {
  const weeks = Math.floor(days.length / DAYS_PER_WEEK);
  const labels: HeatmapMonthLabel[] = [];
  let vorherigerMonat = -1;

  for (let weekIndex = 0; weekIndex < weeks; weekIndex++) {
    const montag = days[weekIndex * DAYS_PER_WEEK];
    const monat = Number(montag.dateKey.slice(5, 7)) - 1;
    const tagImMonat = Number(montag.dateKey.slice(8, 10));
    const monatsWechsel = weekIndex === 0 ? tagImMonat <= DAYS_PER_WEEK : monat !== vorherigerMonat;
    vorherigerMonat = monat;

    if (!monatsWechsel) continue;
    // Zu dicht am Vorgänger würde sich der Text überlappen, zu dicht am
    // rechten Rand über das Gitter hinauslaufen.
    const letztes = labels[labels.length - 1];
    if (letztes && weekIndex - letztes.weekIndex < minWeekGap) continue;
    if (weeks - weekIndex < 2) continue;

    labels.push({ label: MONATE_KURZ[monat], weekIndex });
  }

  return labels;
}
