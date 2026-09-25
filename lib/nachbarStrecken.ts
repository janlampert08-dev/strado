// "Weitere Strecken in der Nähe" auf der Streckenseite — die Auswahl selbst,
// ohne Datenbank, damit sie prüfbar bleibt (lib/nachbarStrecken.test.ts).
// Die Abfrage steht in lib/routes.ts (getNachbarStrecken).
//
// Nicht dasselbe wie getKontextStrecken(): jene Auswahl zeichnet Linien auf
// die Aufzeichnungskarte und misst deshalb Geometrie gegen Geometrie. Hier
// geht es um die Frage "wohin als Nächstes?", und die beantwortet der
// Startpunkt — dort fährt man hin.
import { haversineKm } from "@/lib/geo";

/** Bis hierhin gilt eine Strecke als "in der Nähe": eine gute halbe Stunde
 *  Anfahrt im Alpenraum. Gesetzt, nicht gemessen. */
export const NACHBAR_UMKREIS_KM = 60;
export const NACHBAR_MAX = 6;
/** So viele sollen es mindestens sein, wenn es sie gibt — notfalls aus
 *  derselben Region oder, dahinter, einfach die nächsten. */
export const NACHBAR_MIN = 3;

export interface NachbarKandidat {
  id: string;
  region: string;
  /** [lng, lat] des Startpunkts. */
  start: [number, number];
}

export function waehleNachbarStrecken<T extends NachbarKandidat>(
  alle: T[],
  bezug: NachbarKandidat,
  {
    umkreisKm = NACHBAR_UMKREIS_KM,
    max = NACHBAR_MAX,
    min = NACHBAR_MIN,
  }: { umkreisKm?: number; max?: number; min?: number } = {},
): { strecke: T; distanzKm: number }[] {
  const sortiert = alle
    .filter((k) => k.id !== bezug.id)
    .map((strecke) => ({ strecke, distanzKm: haversineKm(bezug.start, strecke.start) }))
    .filter(({ distanzKm }) => Number.isFinite(distanzKm))
    .sort((a, b) => a.distanzKm - b.distanzKm);

  const gewaehlt = sortiert.filter(({ distanzKm }) => distanzKm <= umkreisKm).slice(0, max);
  const schonDrin = new Set(gewaehlt.map(({ strecke }) => strecke.id));

  // Zu wenige im Umkreis: zuerst dieselbe Region (eine Passregion liegt oft
  // weiter auseinander als 60 km), dann schlicht die nächsten. Die Distanz
  // steht in der Zeile, also täuscht auch eine weiter entfernte keine Nähe
  // vor.
  const auffuellen = (bedingung: (s: T) => boolean) => {
    for (const eintrag of sortiert) {
      if (gewaehlt.length >= min) return;
      if (schonDrin.has(eintrag.strecke.id) || !bedingung(eintrag.strecke)) continue;
      gewaehlt.push(eintrag);
      schonDrin.add(eintrag.strecke.id);
    }
  };
  auffuellen((s) => s.region === bezug.region);
  auffuellen(() => true);

  return gewaehlt.sort((a, b) => a.distanzKm - b.distanzKm);
}
