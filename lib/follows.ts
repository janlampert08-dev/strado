import { createClient } from "@/lib/supabase/server";
import { throwOnQueryError } from "@/lib/queryError";

export async function isFollowing(followerId: string, followedId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("follows")
    .select("followed_id")
    .eq("follower_id", followerId)
    .eq("followed_id", followedId)
    .maybeSingle();
  return data !== null;
}

// Wie der Betrachter zu einem Profil steht (0146): er folgt, hat angefragt,
// oder keins von beidem — plus ob das Profil Anfragen verlangt, damit der
// Knopf "Folgen" oder "Anfrage senden" sagen kann.
export type FolgeZustand = "folgt" | "angefragt" | "keiner";

export async function getFolgeZustand(
  viewerId: string,
  targetId: string,
): Promise<{ zustand: FolgeZustand; brauchtBestaetigung: boolean }> {
  const supabase = await createClient();
  const [{ data: folgt }, { data: anfrage }, { data: braucht }] = await Promise.all([
    supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", viewerId)
      .eq("followed_id", targetId)
      .maybeSingle(),
    supabase
      .from("folge_anfragen")
      .select("an")
      .eq("von", viewerId)
      .eq("an", targetId)
      .maybeSingle(),
    // Dieselbe Regel wie toggleFollow und die Policies (0146/0147).
    supabase.rpc("folgen_braucht_bestaetigung", { p_ziel: targetId }),
  ]);
  return {
    zustand: folgt ? "folgt" : anfrage ? "angefragt" : "keiner",
    // Im Zweifel an: so zeigt der Knopf eher "Folgen anfragen" als ein
    // Folgen zu versprechen, das die Datenbank (0147) ablehnt.
    brauchtBestaetigung: braucht !== false,
  };
}

export interface Folgeanfrage {
  von: string;
  displayName: string | null;
  avatarUrl: string | null;
  erstelltAm: string;
  neu: boolean;
}

// Offene Anfragen an den eingeloggten Nutzer, für /aktivitaet. Wie
// recent_follows_received: SECURITY DEFINER, nur auth.uid(), keine
// Parameter (0146).
export async function getOffeneFolgeanfragen(): Promise<Folgeanfrage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("offene_folgeanfragen");
  // Bewusst NICHT throwOnQueryError: die Anfragen sind ein Abschnitt über der
  // Zeitachse. Ein Fehler hier soll nicht die ganze /aktivitaet-Seite (Kudos,
  // Follower, Passmeldungen) in die Fehlerseite ziehen.
  if (error) {
    console.error("Folgeanfragen konnten nicht geladen werden", error);
    return [];
  }
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    von: row.von as string,
    displayName: row.display_name as string | null,
    avatarUrl: row.avatar_url as string | null,
    erstelltAm: row.erstellt_am as string,
    neu: row.neu as boolean,
  }));
}

// Für den "Folge ich"-Filter im Feed (lib/feed.ts) — eine einzige Query
// statt einer pro Fahrt/Nutzer.
export async function getFollowedUserIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("followed_id").eq("follower_id", userId);
  return (data ?? []).map((r) => r.followed_id);
}

export interface FollowCounts {
  followers: number;
  following: number;
}

export interface FollowProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// Ab 0037_public_follows.sql, gehärtet in 0040_follower_liste_view_lockdown.sql:
// public_follows selbst ist nicht mehr direkt an anon/authenticated gegrantet
// (wäre sonst per PostgREST direkt abfragbar und würde zeigt_follower_liste
// aus 0039 komplett umgehen) — Zahlen und Listen laufen jetzt über
// SECURITY-DEFINER-Funktionen, die die Sichtbarkeitsregel serverseitig
// durchsetzen statt sie dem Aufrufer (dieser Seite) zu überlassen.
export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_follow_counts", { p_user_id: userId }).single();
  const row = data as FollowCounts | null;
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}

interface FollowerListRow {
  follower_id: string;
  follower_display_name: string | null;
  follower_avatar_url: string | null;
}

export async function getFollowerProfiles(userId: string): Promise<FollowProfile[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_follower_list", { p_user_id: userId });
  return ((data as FollowerListRow[] | null) ?? []).map((r) => ({
    id: r.follower_id,
    displayName: r.follower_display_name,
    avatarUrl: r.follower_avatar_url,
  }));
}

interface FollowingListRow {
  followed_id: string;
  followed_display_name: string | null;
  followed_avatar_url: string | null;
}

export async function getFollowingProfiles(userId: string): Promise<FollowProfile[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_following_list", { p_user_id: userId });
  return ((data as FollowingListRow[] | null) ?? []).map((r) => ({
    id: r.followed_id,
    displayName: r.followed_display_name,
    avatarUrl: r.followed_avatar_url,
  }));
}

export interface MutualFollowers {
  preview: FollowProfile[];
  totalCount: number;
}

interface MutualFollowerRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  total_count: number;
}

const MUTUAL_FOLLOWERS_PREVIEW_LIMIT = 3;

// "Gefolgt von ..." — Personen, denen viewerId selbst folgt und die
// ihrerseits profileId folgen (0053_gefolgt_von_feature.sql). Nur sinnvoll
// für eingeloggte Betrachter auf einem fremden Profil; die Funktion selbst
// erzwingt zusätzlich auth.uid() = viewerId, ein falscher Aufruf liefert
// also ohnehin nur eine leere Liste statt fremder Daten.
export async function getMutualFollowers(
  viewerId: string,
  profileId: string,
): Promise<MutualFollowers> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_mutual_followers", {
    p_viewer_id: viewerId,
    p_profile_id: profileId,
    p_limit: MUTUAL_FOLLOWERS_PREVIEW_LIMIT,
  });
  const rows = (data as MutualFollowerRow[] | null) ?? [];
  return {
    preview: rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
    })),
    totalCount: rows[0]?.total_count ?? 0,
  };
}

export interface ReceivedFollower {
  followerId: string;
  followerDisplayName: string | null;
  followerAvatarUrl: string | null;
  erstelltAm: string;
  neu: boolean;
}

// Die letzten Personen, die dem eingeloggten Nutzer gefolgt sind — die
// Follower-Hälfte von /aktivitaet (lib/aktivitaetsliste.ts). Läuft über die
// SECURITY-DEFINER-Funktion recent_follows_received
// (0100_folge_benachrichtigungen.sql), die wie ihre Kudos-Schwester
// (recent_kudos_received, 0057) keine Parameter nimmt und ausschliesslich
// auf auth.uid() arbeitet: es gibt bewusst keinen Weg, die neuen Follower
// eines anderen Kontos abzufragen.
//
// Die Meldung verschwindet wieder, wenn der Follower entfolgt — sie wird
// aus der follows-Zeile abgeleitet, nicht aus einem Ereignislog. Bewusst,
// siehe Kopf der Migration.
export async function getRecentFollowersReceived(): Promise<ReceivedFollower[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recent_follows_received");
  // Wie bei den Kudos: ein echter Query-Fehler darf nicht als "noch keine
  // Follower" durchgehen, sonst sieht ein Ausfall aus wie ein leerer, aber
  // funktionierender Zustand (lib/queryError.ts).
  throwOnQueryError(error, "Follower-Aktivität");
  if (!data) return [];

  const zeilen = data as Array<Record<string, unknown>>;

  return zeilen.map((row) => ({
    followerId: row.follower_id as string,
    followerDisplayName: row.follower_display_name as string | null,
    followerAvatarUrl: row.follower_avatar_url as string | null,
    erstelltAm: row.erstellt_am as string,
    neu: row.neu as boolean,
  }));
}
