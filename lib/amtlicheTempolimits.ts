import {
  AmtlicherIndex,
  tempolimitsAbgleichen,
  type AmtlichesObjekt,
  type Lv95,
} from "@/lib/tempolimitAbgleich";
import type { GeoLineString, TempolimitSegment } from "@/types/database";

// Ergänzt die Tempolimits einer neu angelegten Strecke um die amtlichen
// Werte aus der Tabelle amtliche_tempolimits (0102). Der Client schickt
// Mapbox-/OSM-Schätzungen; wo ein Kanton oder eine Stadt die signalisierte
// Geschwindigkeit veröffentlicht, gilt stattdessen diese.
//
// Scheitert die Abfrage, bleibt es bei den Werten des Clients — wie beim
// Höhenprofil soll ein Ausfall den Vorschlag nicht blockieren, und die
// Strecke ist mit Kartendaten nicht schlechter dran als vor 0102.

// Bewusst eine schmale Schnittstelle statt SupabaseClient, wie in
// lib/avatarSpeicher.ts: so ist die Funktion ohne Netz prüfbar, und
// supabase.rpc erfüllt sie strukturell.
export interface AmtlicheTempolimitsRpc {
  rpc(
    fn: "amtliche_tempolimits_entlang",
    args: { p_geometry_geojson: GeoLineString },
  ): PromiseLike<{ data: AmtlicheZeile[] | null; error: { message: string } | null }>;
}

export interface AmtlicheZeile {
  quelle: string;
  rang: number;
  rand_m: number;
  kmh: number;
  // false für OpenStreetMap; fehlt, solange 0104 nicht eingespielt ist.
  amtlich?: boolean;
  geom_geojson: { type: string; coordinates: unknown } | null;
}

export async function mitAmtlichenTempolimits(
  supabase: AmtlicheTempolimitsRpc,
  geometry: GeoLineString,
  basis: TempolimitSegment[],
): Promise<TempolimitSegment[]> {
  const { data, error } = await supabase.rpc("amtliche_tempolimits_entlang", {
    p_geometry_geojson: geometry,
  });
  if (error) {
    console.error("[amtlicheTempolimits] Abfrage fehlgeschlagen:", error.message);
    return basis;
  }
  const objekte = (data ?? []).map(zuObjekt).filter((o): o is AmtlichesObjekt => o !== null);
  if (objekte.length === 0) return basis;
  return tempolimitsAbgleichen(new AmtlicherIndex(objekte), geometry.coordinates, basis);
}

// ST_Intersection mit dem Korridor kann jede Geometrie liefern, auch eine
// GeometryCollection oder einen Punkt, wo eine Achse den Puffer nur berührt.
// Brauchbar sind nur Linien und Flächen; der Rest fällt weg.
export function zuObjekt(z: AmtlicheZeile): AmtlichesObjekt | null {
  const g = z.geom_geojson;
  if (!g) return null;
  const basis = { quelle: z.quelle, rang: z.rang, randM: z.rand_m, kmh: z.kmh, amtlich: z.amtlich !== false };
  switch (g.type) {
    case "LineString":
      return { ...basis, linien: [g.coordinates as Lv95[]] };
    case "MultiLineString":
      return { ...basis, linien: g.coordinates as Lv95[][] };
    case "Polygon":
      return { ...basis, flaechen: [g.coordinates as Lv95[][]] };
    case "MultiPolygon":
      return { ...basis, flaechen: g.coordinates as Lv95[][][] };
    default:
      return null;
  }
}
