import { createClient } from "@/lib/supabase/server";
import { getKudosForCompletions, type KudosInfo } from "@/lib/kudos";
import { getFollowedUserIds } from "@/lib/follows";
import type { PublicFahrt } from "@/types/database";

export type FeedScope = "global" | "following";

export interface FeedItem extends PublicFahrt {
  kudos: KudosInfo;
}

// Ein voller Bildschirm auf Mobile/Desktop plus etwas Puffer — kein
// Infinite-Scroll/Paging in diesem ersten Schritt, siehe app/feed/page.tsx.
const FEED_LIMIT = 30;

// Baut auf public_fahrten auf (0017/0018/0029/0030) — dieselbe Sicht, die
// schon das öffentliche Profil (lib/profile.ts) nutzt, hier über mehrere
// Nutzer hinweg statt auf einen einzelnen gefiltert. RLS auf den
// zugrundeliegenden Tabellen ist irrelevant, da public_fahrten selbst
// bereits serverseitig auf ist_oeffentlich=true filtert und an
// anon/authenticated freigegeben ist.
export async function getFeed(scope: FeedScope, viewerId: string | null): Promise<FeedItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("public_fahrten")
    .select("*")
    .order("datum", { ascending: false })
    // datum ist ein DATE, keine Zeitangabe — an einem gut gefahrenen Tag
    // teilen sich beliebig viele Fahrten denselben Sortierschlüssel, und
    // Postgres darf sie dann in beliebiger Reihenfolge liefern. Mit einem
    // limit heisst das: welche 30 überhaupt erscheinen, ist nicht stabil.
    // completion_id als zweiter Schlüssel macht die Reihenfolge eindeutig
    // und deckt sich mit route_completions_oeffentlich_datum_idx aus 0075
    // (datum desc, id desc — id der Basistabelle ist hier completion_id).
    .order("completion_id", { ascending: false })
    .limit(FEED_LIMIT);

  if (scope === "following") {
    if (!viewerId) return [];
    const followedIds = await getFollowedUserIds(viewerId);
    if (followedIds.length === 0) return [];
    query = query.in("user_id", followedIds);
  }

  const { data } = await query;
  const fahrten = (data as PublicFahrt[]) ?? [];
  if (fahrten.length === 0) return [];

  const completionIds = fahrten.map((f) => f.completion_id);
  const kudosByCompletion = await getKudosForCompletions(completionIds, viewerId);

  return fahrten.map((f) => ({
    ...f,
    kudos: kudosByCompletion.get(f.completion_id) ?? { count: 0, givenByMe: false },
  }));
}
