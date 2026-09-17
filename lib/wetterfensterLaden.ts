import { createClient } from "@/lib/supabase/server";
import { fetchTagesvorhersage, type VorhersagePunkt } from "@/lib/weather";
import {
  abHeute,
  beurteileTag,
  heuteInZuerich,
  hoechsterPunkt,
  kombiniereTage,
  leseOpenMeteo,
  type Tagesurteil,
} from "@/lib/wetterfenster";
import type { FahrzeugTyp, GeoLineString, GeoPoint, HoehenprofilPunkt } from "@/types/database";

// Serverseitiger Teil des Wetterfensters: Strecke → Abfragepunkte →
// Open-Meteo → Urteile. Die Premium-Frage wird hier NICHT gestellt — sie
// steht bei den Aufrufern (Streckenseite, Profil), die nur für ein aktives
// Abo überhaupt hierher kommen. So bleibt diese Datei die blosse Mechanik,
// und das Gate steht dort, wo man es beim Lesen der Seite sieht.

export type WetterStrecke = {
  start_geojson: GeoPoint;
  geometry_geojson: GeoLineString;
  hoehenprofil: HoehenprofilPunkt[] | null;
};

export interface Wetterfenster {
  tage: Tagesurteil[];
  heute: string;
  /** Höhe des zweiten Messpunkts, falls einer mitgefragt wurde. */
  hoechsterPunktM: number | null;
}

export async function ladeWetterfenster(
  strecke: WetterStrecke,
  fahrzeug: FahrzeugTyp,
): Promise<Wetterfenster | null> {
  const start = strecke.start_geojson.coordinates as [number, number];
  const oben = hoechsterPunkt(
    strecke.geometry_geojson.coordinates as [number, number][],
    strecke.hoehenprofil,
  );

  const punkte: VorhersagePunkt[] = oben
    ? [
        { koordinate: start, hoeheM: oben.startM },
        { koordinate: oben.koordinate, hoeheM: oben.hoeheM },
      ]
    : [{ koordinate: start }];

  const json = await fetchTagesvorhersage(punkte);
  if (json === null) return null;

  const heute = heuteInZuerich();
  const [startTage = [], obenTage] = leseOpenMeteo(json).map((ort) =>
    abHeute(ort, heute).map((t) => beurteileTag(t, fahrzeug)),
  );
  if (startTage.length === 0) return null;

  return {
    tage: kombiniereTage(startTage, oben ? (obenTage ?? null) : null, oben?.hoeheM ?? null),
    heute,
    hoechsterPunktM: oben?.hoeheM ?? null,
  };
}

/** Wie viele Favoriten das Profil höchstens abfragt — siehe dort. */
export const WETTER_FAVORITEN_MAX = 5;

export interface FavoritWetter {
  id: string;
  name: string;
  fenster: Wetterfenster;
}

/**
 * Wetterfenster für die ersten Favoriten, in der übergebenen Reihenfolge.
 * Strecken ohne Vorhersage fallen still heraus.
 *
 * Die Geometrie kommt aus einer eigenen Abfrage auf routes_geojson: die
 * Favoritenliste im Profil joint die Tabelle routes, deren Geografie-Spalten
 * PostgREST als EWKB statt als GeoJSON ausgibt. Unter RLS des angemeldeten
 * Kontos — eine inzwischen privat gewordene fremde Strecke kommt so gar
 * nicht erst zurück.
 */
export async function ladeFavoritenWetter(
  routeIds: string[],
  fahrzeug: FahrzeugTyp,
): Promise<FavoritWetter[]> {
  const ids = routeIds.slice(0, WETTER_FAVORITEN_MAX);
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select("id, name, start_geojson, geometry_geojson, hoehenprofil")
    .in("id", ids);
  if (error || !data) return [];

  const strecken = new Map(
    (data as ({ id: string; name: string } & WetterStrecke)[]).map((s) => [s.id, s]),
  );

  const ergebnisse = await Promise.all(
    ids.map(async (id) => {
      const s = strecken.get(id);
      if (!s) return null;
      const fenster = await ladeWetterfenster(s, fahrzeug);
      return fenster ? { id, name: s.name, fenster } : null;
    }),
  );
  return ergebnisse.filter((e): e is FavoritWetter => e !== null);
}
