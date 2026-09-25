import { fetchCurrentWeather } from "@/lib/weather";

// Das Wetter von jetzt am Start einer Strecke, als Wert in der
// Detailzeile der Streckenseite (Kennzahlenzeile). Eine async Server
// Component, die ihren Abruf selbst macht — wie das Wetterfenster
// (components/Wetterfenster.tsx): die Seite hängt sie in eine
// Suspense-Grenze, damit Open-Meteo nie den Rest der Seite aufhält.
//
// Vorher stand fetchCurrentWeather im grossen Promise.all der Seite. Mit
// bis zu 2,5 s Zeitlimit (lib/weather.ts) war Open-Meteo damit die
// langsamste Abfrage der ganzen Seite, und das für eine einzige Angabe.

export default async function AktuellesWetter({
  koordinate,
}: {
  /** Startpunkt der Strecke, [lon, lat] wie in GeoJSON. */
  koordinate: [number, number];
}) {
  const wetter = await fetchCurrentWeather(koordinate);
  // Gleiche Darstellung wie ein fehlender Wert in der Kennzahlenzeile
  // (components/ui/Kennzahl.tsx): "keine Angabe" statt eines Strichs.
  if (!wetter) return <>keine Angabe</>;
  return (
    <span className="tabular-nums text-foreground">
      {wetter.tempC} °C, {wetter.label}
    </span>
  );
}

/**
 * Platzhalter, solange Open-Meteo antwortet. Ein span und kein
 * <Skeleton> (div): der Wert steht in einem <p>, ein div darin wäre
 * ungültiges HTML und liefe auf einen Hydration-Fehler. Die Breite liegt
 * bei einem typischen Wert ("14 °C, Bewölkt"), damit die Zeile beim
 * Nachrücken möglichst nicht umbricht.
 */
export function AktuellesWetterPlatzhalter() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[1em] w-[13ch] animate-pulse rounded-sm bg-foreground/10 align-[-0.125em]"
    />
  );
}
