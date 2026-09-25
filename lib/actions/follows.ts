"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";
import type { FolgeZustand } from "@/lib/follows";

const FOLLOW_COOLDOWN_MS = 500;

// Ein Knopf, drei Zustände (0146): folgt → entfolgen; angefragt → Anfrage
// zurückziehen; keiner → folgen, oder eine Anfrage stellen, wenn das Profil
// Follower bestätigt. Selbst-Folgen verhindern zusätzlich die Constraints
// follows_not_self (0030) und folge_anfragen_nicht_selbst (0146) — der Check
// hier vermeidet nur den unnötigen Roundtrip.
//
// Ob angefragt statt gefolgt wird, entscheidet hier der Server, nicht der
// Knopf: der kennt die Einstellung nur vom Laden der Seite. Die Datenbank
// setzt dasselbe mit 0147 durch.
export async function toggleFollow(
  targetUserId: string,
): Promise<{
  ok: boolean;
  zustand?: FolgeZustand;
  // Der Zustand VOR dem Tipp, wie die Datenbank ihn sah — nicht, wie der
  // Knopf ihn zeigte. Eine offene Seite kann veraltet sein (die Anfrage ist
  // inzwischen angenommen), und die Quittung soll sagen, was geschehen ist.
  vorher?: FolgeZustand;
  brauchtBestaetigung?: boolean;
}> {
  if (!isValidUuid(targetUserId)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id === targetUserId) return { ok: false };

  // Beide Tabellen: Anfragen legen keine follows-Zeile an und liefen sonst
  // an der Sperre vorbei.
  const [folgenGesperrt, anfragenGesperrt] = await Promise.all([
    isRateLimited(supabase, "follows", "erstellt_am", "follower_id", user.id, FOLLOW_COOLDOWN_MS),
    isRateLimited(supabase, "folge_anfragen", "erstellt_am", "von", user.id, FOLLOW_COOLDOWN_MS),
  ]);
  if (folgenGesperrt || anfragenGesperrt) return { ok: false };

  const [{ data: folgt }, { data: anfrage }] = await Promise.all([
    supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", user.id)
      .eq("followed_id", targetUserId)
      .maybeSingle(),
    supabase
      .from("folge_anfragen")
      .select("an")
      .eq("von", user.id)
      .eq("an", targetUserId)
      .maybeSingle(),
  ]);

  let zustand: FolgeZustand;
  if (folgt) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("followed_id", targetUserId);
    if (error) return { ok: false };
    zustand = "keiner";
  } else if (anfrage) {
    const { error } = await supabase
      .from("folge_anfragen")
      .delete()
      .eq("von", user.id)
      .eq("an", targetUserId);
    if (error) return { ok: false };
    zustand = "keiner";
  } else {
    // Dieselbe Regel, die die Policies durchsetzen (0146/0147), statt sie
    // hier aus profiles nachzubauen — sie nimmt z. B. gelöschte Konten aus.
    const { data: braucht, error: regelFehler } = await supabase.rpc(
      "folgen_braucht_bestaetigung",
      { p_ziel: targetUserId },
    );
    if (regelFehler) return { ok: false };

    if (braucht === true) {
      const { error } = await supabase
        .from("folge_anfragen")
        .insert({ von: user.id, an: targetUserId });
      if (error) return { ok: false };
      zustand = "angefragt";
    } else {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: user.id, followed_id: targetUserId });
      if (error) return { ok: false };
      zustand = "folgt";
    }
  }

  revalidatePath(`/fahrer/${targetUserId}`);
  revalidatePath("/feed");
  // Der Aktivitäts-Rückkanal des Gefolgten (Kernloop-Schritt 8) und der
  // Ungelesen-Zähler im Header hängen an dieser Beziehung — beim Entfolgen
  // genauso wie beim Folgen: die Meldung wird aus der follows-Zeile
  // abgeleitet (0100) und verschwindet mit ihr wieder. Offene Anfragen
  // stehen seit 0146 ebenfalls dort.
  revalidatePath("/aktivitaet");

  const vorher: FolgeZustand = folgt ? "folgt" : anfrage ? "angefragt" : "keiner";
  // Nur fürs Rückgängig nach dem Entfolgen gebraucht: verlangt das Profil
  // eine Bestätigung, wäre "erneut folgen" nur eine neue Anfrage.
  let brauchtBestaetigung: boolean | undefined;
  if (vorher === "folgt") {
    const { data } = await supabase.rpc("folgen_braucht_bestaetigung", { p_ziel: targetUserId });
    brauchtBestaetigung = data === true;
  }
  return { ok: true, zustand, vorher, brauchtBestaetigung };
}

// Einen eigenen Follower entfernen (0149). Wichtig für Fahrten "nur für
// Follower": wer vor den Folgeanfragen (0146) gefolgt ist, brauchte keine
// Bestätigung — so lässt sich der Kreis nachträglich schliessen.
export async function followerEntfernen(followerId: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(followerId)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === followerId) return { ok: false };

  const { error, count } = await supabase
    .from("follows")
    .delete({ count: "exact" })
    .eq("follower_id", followerId)
    .eq("followed_id", user.id);
  if (error || count === 0) return { ok: false };

  revalidatePath("/profil");
  revalidatePath(`/fahrer/${user.id}`);
  revalidatePath(`/fahrer/${followerId}`);
  revalidatePath("/feed");
  return { ok: true };
}

// Annehmen: aus der Anfrage wird eine follows-Zeile. Läuft über
// folgeanfrage_annehmen (SECURITY DEFINER, 0146), weil die Zeile dem
// Anfragenden gehört — die Funktion setzt nur Anfragen an den Aufrufer um.
export async function folgeanfrageAnnehmen(vonUserId: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(vonUserId)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data, error } = await supabase.rpc("folgeanfrage_annehmen", { p_von: vonUserId });
  if (error || data !== true) return { ok: false };

  revalidatePath("/aktivitaet");
  revalidatePath(`/fahrer/${user.id}`);
  revalidatePath(`/fahrer/${vonUserId}`);
  return { ok: true };
}

// Ablehnen ist Löschen; RLS lässt nur Anfragen zu, an denen man beteiligt
// ist (0146), der an-Filter hält es auf die an einen selbst gerichteten.
export async function folgeanfrageAblehnen(vonUserId: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(vonUserId)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("folge_anfragen")
    .delete()
    .eq("von", vonUserId)
    .eq("an", user.id);
  if (error) return { ok: false };

  revalidatePath("/aktivitaet");
  revalidatePath(`/fahrer/${vonUserId}`);
  return { ok: true };
}
