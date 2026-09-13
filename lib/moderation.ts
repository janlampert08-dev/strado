import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { freieFahrtTitel } from "@/lib/completions";
import type { Route } from "@/types/database";

// Pro Request memoisiert: <Header /> fragt den Moderator-Status auf jeder
// Seite ab, /moderation zusätzlich noch einmal für den Zugriffsschutz.
export const isModerator = cache(async function isModerator(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_moderator")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_moderator ?? false;
});

export async function getPendingRoutes(): Promise<Route[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("routes")
    .select("*")
    .eq("status_ok", false)
    .eq("ist_privat", false)
    .is("abgelehnt_am", null)
    .order("created_at", { ascending: true });
  return (data as Route[]) ?? [];
}

export interface RouteReportWithContext {
  id: string;
  routeId: string;
  routeName: string;
  grund: string;
  kommentar: string | null;
  erstelltAm: string;
}

// Getrennte Folgeabfrage für die Streckennamen statt eines embedded Selects
// (route_reports.select("*, routes(name)")) — dasselbe Muster wie
// getRatings() in lib/ratings.ts (dort für Profile), um nicht auf
// PostgREST-Relationship-Inferenz und deren Typinferenz angewiesen zu sein.
export async function getOpenRouteReports(): Promise<RouteReportWithContext[]> {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("route_reports")
    .select("id, route_id, grund, kommentar, erstellt_am")
    .eq("status", "offen")
    .order("erstellt_am", { ascending: true });

  if (!reports || reports.length === 0) return [];

  const routeIds = [...new Set(reports.map((r) => r.route_id))];
  const { data: routes } = await supabase.from("routes").select("id, name").in("id", routeIds);
  const nameById = new Map((routes ?? []).map((r) => [r.id, r.name]));

  return reports.map((r) => ({
    id: r.id,
    routeId: r.route_id,
    routeName: nameById.get(r.route_id) ?? "Unbekannte Strecke",
    grund: r.grund,
    kommentar: r.kommentar,
    erstelltAm: r.erstellt_am,
  }));
}

export interface RatingReportWithContext {
  id: string;
  ratingId: string;
  routeId: string;
  routeName: string;
  ratingKommentar: string | null;
  grund: string;
  kommentar: string | null;
  erstelltAm: string;
}

export async function getOpenRatingReports(): Promise<RatingReportWithContext[]> {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("rating_reports")
    .select("id, rating_id, grund, kommentar, erstellt_am")
    .eq("status", "offen")
    .order("erstellt_am", { ascending: true });

  if (!reports || reports.length === 0) return [];

  const ratingIds = [...new Set(reports.map((r) => r.rating_id))];
  const { data: ratings } = await supabase
    .from("route_ratings")
    .select("id, route_id, kommentar")
    .in("id", ratingIds);
  const ratingById = new Map((ratings ?? []).map((r) => [r.id, r]));

  const routeIds = [...new Set(Array.from(ratingById.values()).map((r) => r.route_id))];
  const { data: routes } = await supabase.from("routes").select("id, name").in("id", routeIds);
  const routeNameById = new Map((routes ?? []).map((r) => [r.id, r.name]));

  return reports.map((r) => {
    // rating_reports.rating_id → route_ratings.id ist "on delete cascade"
    // (0043): eine gemeldete Bewertung, die bereits gelöscht wurde, hätte
    // ihre offenen Meldungen automatisch mitgelöscht — dieser Fall kann
    // hier also nicht auftreten.
    const rating = ratingById.get(r.rating_id)!;
    return {
      id: r.id,
      ratingId: r.rating_id,
      routeId: rating.route_id,
      routeName: routeNameById.get(rating.route_id) ?? "Unbekannte Strecke",
      ratingKommentar: rating.kommentar,
      grund: r.grund,
      kommentar: r.kommentar,
      erstelltAm: r.erstellt_am,
    };
  });
}

export interface CompletionReportWithContext {
  id: string;
  completionId: string;
  // Anzeigetitel der Fahrt: Streckenname oder der selbst vergebene Titel
  // einer freien Fahrt.
  fahrtTitel: string;
  istFreieFahrt: boolean;
  fahrtNotiz: string | null;
  grund: string;
  kommentar: string | null;
  erstelltAm: string;
}

// Wie getOpenRouteReports/getOpenRatingReports: getrennte Folgeabfragen
// statt eines embedded Selects, um nicht auf PostgREST-Relationship-Inferenz
// angewiesen zu sein.
export async function getOpenCompletionReports(): Promise<CompletionReportWithContext[]> {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("completion_reports")
    .select("id, completion_id, grund, kommentar, erstellt_am")
    .eq("status", "offen")
    .order("erstellt_am", { ascending: true });

  if (!reports || reports.length === 0) return [];

  const completionIds = [...new Set(reports.map((r) => r.completion_id))];
  // Über public_fahrten statt route_completions: die Tabelle selbst ist per
  // RLS auf den Besitzer beschränkt, und ein Moderator ist das nicht. Die
  // View zeigt genau die öffentlichen Fahrten — und nur die können gemeldet
  // werden (Insert-Policy in 0046).
  const { data: fahrten } = await supabase
    .from("public_fahrten")
    .select("completion_id, art, titel, start_ort, route_name, notiz")
    .in("completion_id", completionIds)
    .returns<
      {
        completion_id: string;
        art: "strecke" | "frei";
        titel: string | null;
        start_ort: string | null;
        route_name: string | null;
        notiz: string | null;
      }[]
    >();

  const fahrtById = new Map((fahrten ?? []).map((f) => [f.completion_id, f]));

  return reports.flatMap((r) => {
    const fahrt = fahrtById.get(r.completion_id);
    // Eine Fahrt, die inzwischen wieder privat ist (vom Fahrer selbst oder
    // durch eine frühere Moderation), taucht in der View nicht mehr auf —
    // die Meldung hat sich damit erledigt und gehört nicht in die Liste.
    if (!fahrt) return [];
    return [
      {
        id: r.id,
        completionId: r.completion_id,
        fahrtTitel:
          fahrt.art === "frei"
            ? freieFahrtTitel(fahrt.titel, fahrt.start_ort)
            : (fahrt.route_name ?? "Unbekannte Strecke"),
        istFreieFahrt: fahrt.art === "frei",
        fahrtNotiz: fahrt.notiz,
        grund: r.grund,
        kommentar: r.kommentar,
        erstelltAm: r.erstellt_am,
      },
    ];
  });
}

export interface FeedbackEintrag {
  id: string;
  kategorie: string;
  nachricht: string;
  // Anzeigename des Absenders, soweit gesetzt — für eine mögliche Rückfrage.
  absender: string | null;
  erstelltAm: string;
}

// Offene Rückmeldungen aus den Einstellungen (0083_feedback.sql). Sichtbar
// sind sie ausschliesslich Moderatoren — das erzwingt die Select-Policy der
// Migration, nicht diese Funktion; /moderation prüft zusätzlich vorher (wie
// bei allem anderen auf der Seite auch).
//
// Getrennte Folgeabfrage für die Absendernamen statt eines embedded Selects,
// wie bei getOpenRouteReports oben — aus demselben Grund.
export async function getOpenFeedback(): Promise<FeedbackEintrag[]> {
  const supabase = await createClient();
  const { data: eintraege } = await supabase
    .from("feedback")
    .select("id, user_id, kategorie, nachricht, erstellt_am")
    .eq("status", "offen")
    .order("erstellt_am", { ascending: true })
    .returns<
      {
        id: string;
        user_id: string;
        kategorie: string;
        nachricht: string;
        erstellt_am: string;
      }[]
    >();

  if (!eintraege || eintraege.length === 0) return [];

  const userIds = [...new Set(eintraege.map((e) => e.user_id))];
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  const nameById = new Map((profile ?? []).map((p) => [p.id, p.display_name]));

  return eintraege.map((e) => ({
    id: e.id,
    kategorie: e.kategorie,
    nachricht: e.nachricht,
    // null bleibt null: ein gelöschtes Konto trägt keinen Namen mehr
    // (0058), und ein erfundener Platzhalter wäre hier irreführend.
    absender: nameById.get(e.user_id) ?? null,
    erstelltAm: e.erstellt_am,
  }));
}
