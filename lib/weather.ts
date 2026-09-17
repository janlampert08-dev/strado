// Aktuelles Wetter am Startpunkt einer Strecke — via Open-Meteo (kostenlos,
// kein API-Key nötig, passt damit zum bestehenden Muster freier Datenquellen
// ohne eigene Zugangsdaten, siehe lib/elevation.ts/swisstopo). Bewusst nur
// der Startpunkt statt eines Profils entlang der ganzen Strecke — bei
// Alpenpässen oft mehrere Wetterzonen, aber "wie sieht's aktuell am Einstieg
// aus" ist die praktisch relevante Frage vor der Abfahrt.
//
// Das Premium-Wetterfenster weiter unten ist die Ausnahme davon: wer fragt,
// an welchem Tag er über den Pass kann, muss auch oben Bescheid wissen.
import { OPEN_METEO_TAGESFELDER } from "@/lib/wetterfenster";

export interface CurrentWeather {
  tempC: number;
  label: string;
}

// WMO-Wettercode (0–99) → kurzes deutsches Label, siehe
// https://open-meteo.com/en/docs (Feld "weather_code"). Bewusst grob
// zusammengefasst (z.B. leichter/starker Regen zusammen) — für eine knappe
// Statuszeile reicht die Kategorie, keine Detailmeldung nötig.
function weatherLabel(code: number): string {
  if (code === 0) return "Klar";
  if (code <= 2) return "Leicht bewölkt";
  if (code === 3) return "Bewölkt";
  if (code === 45 || code === 48) return "Nebel";
  if (code >= 51 && code <= 57) return "Nieselregen";
  if (code >= 61 && code <= 67) return "Regen";
  if (code >= 71 && code <= 77) return "Schneefall";
  if (code >= 80 && code <= 82) return "Regenschauer";
  if (code === 85 || code === 86) return "Schneeschauer";
  if (code >= 95) return "Gewitter";
  return "—";
}

/** Ein Abfragepunkt für die Tagesvorhersage. */
export interface VorhersagePunkt {
  koordinate: [number, number];
  /** Bekannte Höhe in m. Open-Meteo rechnet die Temperatur damit auf genau
   *  diese Höhe um statt auf die mittlere Höhe seiner Rasterzelle — auf
   *  einer Passhöhe der Unterschied zwischen 4 ° und 9 °. */
  hoeheM?: number;
}

// 7-Tage-Vorhersage fürs Wetterfenster (Premium, lib/wetterfenster.ts). Ein
// Aufruf für alle Punkte: Open-Meteo nimmt kommagetrennte Koordinaten und
// antwortet mit einem Array in derselben Reihenfolge.
//
// Koordinaten auf drei Nachkommastellen (~100 m): feiner löst kein
// Wettermodell auf, und so teilen sich Aufrufe derselben Strecke den
// Cache-Eintrag auch dann, wenn die Geometrie minimal anders gespeichert
// ist. Eine Stunde Revalidierung, weil die Modelle ohnehin nur alle paar
// Stunden neu rechnen — öfter zu fragen kostet Kontingent und bringt keine
// neuere Vorhersage.
//
// Null bei jedem Fehler. Das Wetterfenster ist eine Zugabe; eine fehlende
// Vorhersage darf die Streckenseite nie zu einer Fehlerseite machen.
export async function fetchTagesvorhersage(punkte: VorhersagePunkt[]): Promise<unknown | null> {
  if (punkte.length === 0) return null;
  const runde = (n: number) => n.toFixed(3);
  const params = new URLSearchParams({
    latitude: punkte.map((p) => runde(p.koordinate[1])).join(","),
    longitude: punkte.map((p) => runde(p.koordinate[0])).join(","),
    daily: OPEN_METEO_TAGESFELDER.join(","),
    timezone: "Europe/Zurich",
    forecast_days: "7",
  });
  // Höhe nur, wenn sie für ALLE Punkte bekannt ist — die Liste muss so lang
  // sein wie die der Koordinaten, sonst ordnet Open-Meteo sie falsch zu.
  if (punkte.every((p) => p.hoeheM !== undefined)) {
    params.set("elevation", punkte.map((p) => String(Math.round(p.hoeheM!))).join(","));
  }

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchCurrentWeather(
  [lon, lat]: [number, number],
): Promise<CurrentWeather | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
      // Kurzes Caching statt no-store: "aktuell" muss nicht auf die Minute
      // genau sein, spart aber wiederholte Aufrufe bei mehreren Aufrufen
      // derselben Strecke innerhalb kurzer Zeit.
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return null;

    const data: { current?: { temperature_2m?: number; weather_code?: number } } =
      await res.json();
    if (data.current?.temperature_2m === undefined || data.current?.weather_code === undefined) {
      return null;
    }

    return {
      tempC: Math.round(data.current.temperature_2m),
      label: weatherLabel(data.current.weather_code),
    };
  } catch {
    return null;
  }
}
