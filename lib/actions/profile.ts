"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { metadatenEntfernen } from "@/lib/imageMetadata";
import { recomputePublicTracks } from "@/lib/publicTrack";
import { DEFAULT_PRIVACY_RADIUS_M, PRIVACY_RADIUS_OPTIONS } from "@/lib/track";

export interface ProfileActionState {
  error: string | null;
  success?: boolean;
}

export interface ProfileSearchResult {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// Namenssuche für die Profilsuche im Feed (components/ProfileSearch.tsx).
// display_name/avatar_url sind bereits öffentlich lesbar (RLS "Profile sind
// öffentlich lesbar" seit 0001_init.sql, Spalten-Grants in
// 0034_profiles_column_grant_hardening.sql) — dieselben Daten, die z. B. in
// Follower-Listen und Bestenlisten ohnehin für jeden sichtbar sind, hier nur
// zusätzlich per Namenssuche auffindbar statt nur beim Durchblättern.
export async function searchProfiles(query: string): Promise<ProfileSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  // ilike-Sonderzeichen im Nutzer-Input escapen, sonst könnten "%"/"_" selbst
  // als Wildcard statt als gesuchtes Literalzeichen wirken.
  const escaped = trimmed.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, zeigt_avatar")
    .not("display_name", "is", null)
    .ilike("display_name", `%${escaped}%`)
    .order("display_name")
    .limit(8);

  return (data ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    avatarUrl: p.zeigt_avatar ? p.avatar_url : null,
  }));
}

export async function updateVisibilitySettings(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  // Der Privatzonen-Radius kommt aus derselben Maske wie die übrigen
  // Sichtbarkeits-Schalter. Nur die angebotenen Werte sind zulässig, alles
  // andere fällt auf den Standard zurück.
  //
  // Der Feldwert wird bewusst erst als Text geprüft: Number(null) und
  // Number("") ergeben 0, und 0 ist ein gültiger Radius ("Privatzone aus").
  // Ein Formular ohne dieses Feld würde die Privatzone also stillschweigend
  // abschalten — bei einer Datenschutz-Einstellung genau die falsche
  // Richtung.
  const radiusRaw = formData.get("privatzone_radius_m");
  const radius = typeof radiusRaw === "string" && radiusRaw.trim() !== "" ? Number(radiusRaw) : NaN;
  const privatzoneRadiusM = (PRIVACY_RADIUS_OPTIONS as readonly number[]).includes(radius)
    ? radius
    : DEFAULT_PRIVACY_RADIUS_M;

  const { error } = await supabase
    .from("profiles")
    .update({
      privatzone_radius_m: privatzoneRadiusM,
      zeigt_fahrzeuge: formData.get("zeigt_fahrzeuge") === "true",
      zeigt_avatar: formData.get("zeigt_avatar") === "true",
      zeigt_paesse: formData.get("zeigt_paesse") === "true",
      zeigt_hoehenmeter: formData.get("zeigt_hoehenmeter") === "true",
      zeigt_distanz: formData.get("zeigt_distanz") === "true",
      zeigt_follower_liste: formData.get("zeigt_follower_liste") === "true",
      // Premium-Feature (Gold-Badge) vorerst deaktiviert — bleibt aus.
      zeigt_premium_badge: false,
    })
    .eq("id", user.id);

  if (error) return { error: "Einstellungen konnten nicht gespeichert werden." };

  // Ein geänderter Radius muss auch für bereits geteilte Fahrten gelten —
  // sonst wirkte die strengere Einstellung nur in die Zukunft, und genau
  // die alten Fahrten wären das Problem. Schlägt das für eine Fahrt fehl,
  // bleibt dort der bisherige, weitere Track öffentlich: das darf nicht als
  // "Gespeichert." durchgehen.
  const recomputed = await recomputePublicTracks(supabase, user.id, privatzoneRadiusM);
  if (!recomputed) {
    return {
      error:
        "Die Einstellungen wurden gespeichert, aber nicht alle bereits geteilten Fahrten konnten neu zugeschnitten werden. Bitte versuche es noch einmal.",
    };
  }

  revalidatePath("/profil");
  revalidatePath("/profil/einstellungen");
  revalidatePath(`/fahrer/${user.id}`);
  revalidatePath("/feed");
  revalidatePath("/leaderboards");
  return { error: null, success: true };
}

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export async function uploadAvatar(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const foto = formData.get("avatar") as File | null;
  if (!foto || foto.size === 0) return { error: "Bitte ein Foto auswählen." };
  if (!foto.type.startsWith("image/")) return { error: "Nur Bilddateien sind erlaubt." };
  if (foto.size > MAX_AVATAR_BYTES) return { error: "Foto ist zu gross (max. 4 MB)." };

  const ext = foto.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;

  // Wie beim Fahrt-Foto: EXIF-Metadaten raus, bevor die Datei gespeichert
  // wird. Ein Profilbild ist zwar zum Zeigen gedacht, sein Aufnahmeort ist es
  // nicht — und der avatars-Bucket ist öffentlich lesbar.
  const bereinigt = metadatenEntfernen(new Uint8Array(await foto.arrayBuffer()), foto.type);

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    // contentType explizit, weil ein Uint8Array den Typ nicht mitbringt.
    .upload(path, bereinigt, { upsert: true, contentType: foto.type });
  if (uploadError) return { error: "Foto konnte nicht hochgeladen werden." };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-Buster, damit ein ersetztes Avatar sofort neu geladen wird (die
  // öffentliche URL bliebe sonst dieselbe und der Browser zeigt die alte
  // Cache-Version).
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (error) return { error: "Profil konnte nicht aktualisiert werden." };

  revalidatePath("/profil");
  revalidatePath(`/fahrer/${user.id}`);
  return { error: null };
}
