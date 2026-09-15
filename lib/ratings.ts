import { createClient } from "@/lib/supabase/server";
import type { RouteRating } from "@/types/database";
import { bewertungAusSternen, type Streckenbewertung } from "@/lib/bewertungen";

export interface RatingWithAuthor extends RouteRating {
  display_name: string | null;
}

export async function getRatings(routeId: string): Promise<RatingWithAuthor[]> {
  const supabase = await createClient();
  const { data: ratings } = await supabase
    .from("route_ratings")
    .select("*")
    .eq("route_id", routeId)
    .order("erstellt_am", { ascending: false });

  if (!ratings || ratings.length === 0) return [];

  const userIds = [...new Set(ratings.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return ratings.map((r) => {
    const profile = profileById.get(r.user_id);
    return {
      ...r,
      display_name: profile?.display_name ?? null,
    };
  });
}

export async function getOwnRating(routeId: string, userId: string): Promise<RouteRating | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("route_ratings")
    .select("*")
    .eq("route_id", routeId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/**
 * Der Schnitt für eine ganze Seite Strecken — eine Abfrage für alle statt
 * einer pro Zeile, nach dem Muster von getKudosForCompletions (lib/kudos.ts).
 *
 * ---------------------------------------------------------------------------
 * Warum eine zweite Abfrage und keine Spalte in routes_geojson
 * ---------------------------------------------------------------------------
 * Die View wäre der naheliegende Ort, und genau deshalb steht hier dieselbe
 * Begründung wie seinerzeit beim Abzeichen: routes_geojson wird von der
 * Startseite, der Detailseite, der Aufzeichnungskarte und den öffentlichen
 * API-Endpunkten gelesen. Ein `create or replace` müsste ihre vollständige
 * Definition fehlerfrei reproduzieren, und eine falsch reproduzierte View
 * fällt nicht beim Testen auf, sondern im Betrieb. Ein Sternenschnitt ist
 * dieses Risiko nicht wert.
 *
 * Der Preis ist eine zusätzliche Abfrage auf eine kleine, indizierte Tabelle
 * (route_ratings_route_id_idx, 0001). Bei dreizehn freigegebenen Strecken
 * sind das ein paar Dutzend Zeilen.
 *
 * Gelesen werden nur route_id und sterne — nicht user_id. Wer eine Strecke
 * wie bewertet hat, beantwortet die Detailseite ohnehin namentlich, aber die
 * Explore-Liste hat danach nicht gefragt und bekommt es deshalb auch nicht.
 */
export async function getBewertungen(
  routeIds: string[],
): Promise<Map<string, Streckenbewertung>> {
  const ergebnis = new Map<string, Streckenbewertung>();
  const eindeutig = [...new Set(routeIds)];
  if (eindeutig.length === 0) return ergebnis;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_ratings")
    .select("route_id, sterne")
    .in("route_id", eindeutig)
    .not("sterne", "is", null);

  // Ein Fehler darf nicht als "keine Bewertungen" durchgehen — aber er darf
  // auch nicht die Streckenliste mitreissen. Die Liste ist der Kern der
  // Seite, der Schnitt eine Beigabe: ohne ihn fehlt eine Zahl, ohne die
  // Liste fehlt die Seite. Deshalb still leer und eine Zeile im Log, wie es
  // getRoutes() bei seinem eigenen Fehler auch tut.
  if (error) {
    console.error("Bewertungen konnten nicht geladen werden:", error.message);
    return ergebnis;
  }

  const gesammelt = new Map<string, number[]>();
  for (const zeile of (data as { route_id: string; sterne: number | null }[]) ?? []) {
    const bisher = gesammelt.get(zeile.route_id);
    if (bisher) bisher.push(zeile.sterne as number);
    else gesammelt.set(zeile.route_id, [zeile.sterne as number]);
  }

  for (const [routeId, werte] of gesammelt) {
    const bewertung = bewertungAusSternen(werte);
    if (bewertung) ergebnis.set(routeId, bewertung);
  }
  return ergebnis;
}
