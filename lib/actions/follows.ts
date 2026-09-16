"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";

const FOLLOW_COOLDOWN_MS = 500;

// Reines Toggle wie toggleFavorite/toggleKudos (lib/actions/favorites.ts,
// lib/actions/kudos.ts). Selbst-Folgen wird zusätzlich per DB-Constraint
// (follows_not_self, siehe 0030_follows_and_feed.sql) verhindert — der
// Check hier vermeidet nur den unnötigen Roundtrip.
export async function toggleFollow(targetUserId: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(targetUserId)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id === targetUserId) return { ok: false };

  if (await isRateLimited(supabase, "follows", "erstellt_am", "follower_id", user.id, FOLLOW_COOLDOWN_MS)) {
    return { ok: false };
  }

  const { data: existing } = await supabase
    .from("follows")
    .select("followed_id")
    .eq("follower_id", user.id)
    .eq("followed_id", targetUserId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("followed_id", targetUserId)
    : await supabase.from("follows").insert({ follower_id: user.id, followed_id: targetUserId });

  if (error) return { ok: false };

  revalidatePath(`/fahrer/${targetUserId}`);
  revalidatePath("/feed");
  // Der Aktivitäts-Rückkanal des Gefolgten (Kernloop-Schritt 8) und der
  // Ungelesen-Zähler im Header hängen an dieser Beziehung — beim Entfolgen
  // genauso wie beim Folgen: die Meldung wird aus der follows-Zeile
  // abgeleitet (0100) und verschwindet mit ihr wieder.
  revalidatePath("/aktivitaet");
  return { ok: true };
}
