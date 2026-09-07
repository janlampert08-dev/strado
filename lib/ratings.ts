import { createClient } from "@/lib/supabase/server";
import type { RouteRating } from "@/types/database";

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
