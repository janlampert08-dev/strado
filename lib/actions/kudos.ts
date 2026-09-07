"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";

// Kurzer Cooldown gegen skriptgesteuertes Durchklicken vieler Fahrten —
// eine echte Nutzerin, die mehrere Kudos hintereinander vergibt, merkt eine
// halbe Sekunde Abstand zwischen Klicks nicht.
const KUDOS_COOLDOWN_MS = 500;

// Reines Toggle wie toggleFavorite (lib/actions/favorites.ts). RLS
// (0029_kudos.sql) erzwingt unabhängig davon, dass nur auf öffentliche
// Fahrten (ist_oeffentlich = true) Kudos gegeben werden können — ein
// insert auf eine private Fahrt schlägt serverseitig fehl, auch falls hier
// je ein Aufruf mit falscher completionId ankäme.
export async function toggleKudos(completionId: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(completionId)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false };

  if (await isRateLimited(supabase, "kudos", "erstellt_am", "user_id", user.id, KUDOS_COOLDOWN_MS)) {
    return { ok: false };
  }

  // Besitzer der Fahrt mitlesen: nur dessen Fahrerseite muss neu gebaut
  // werden, nicht jede. Ohne diese Abfrage bliebe nur die Segmentform
  // revalidatePath("/fahrer/[id]", "page"), und die entwertet ALLE
  // Instanzen des dynamischen Segments — bei einem einzelnen Kudo also den
  // Cache sämtlicher Fahrer- und Fahrtseiten der Plattform.
  const [{ data: existing }, { data: fahrt }] = await Promise.all([
    supabase
      .from("kudos")
      .select("completion_id")
      .eq("completion_id", completionId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("route_completions")
      .select("user_id")
      .eq("id", completionId)
      .maybeSingle(),
  ]);

  const { error } = existing
    ? await supabase.from("kudos").delete().eq("completion_id", completionId).eq("user_id", user.id)
    : await supabase.from("kudos").insert({ completion_id: completionId, user_id: user.id });

  if (error) return { ok: false };

  revalidatePath(`/fahrten/${completionId}`);
  // Nur die Seite des Fahrt-BESITZERS — dort ändert sich der Kudo-Zähler.
  // Die Seite des Kudo-Gebers ändert sich nicht, deshalb ist auch
  // revalidatePath("/profil") hier weg: /profil ist seine eigene.
  if (fahrt?.user_id) revalidatePath(`/fahrer/${fahrt.user_id}`);
  revalidatePath("/feed");
  // Der Aktivitäts-Rückkanal des Besitzers (Kernloop-Schritt 8) und der
  // Ungelesen-Zähler im Header hängen an dieser Reaktion.
  revalidatePath("/aktivitaet");
  return { ok: true };
}

// Markiert die eigenen Kudos-Reaktionen als gesehen (setzt
// profiles.kudos_gesehen_am = now() über mark_kudos_seen,
// 0053_kudos_gesehen.sql) — aufgerufen beim Laden des eigenen Profils
// (components/MarkKudosSeen.tsx), setzt den Ungelesen-Zähler in der
// Navigation (lib/kudos.ts, getUnseenKudosCount) auf null zurück. Gibt
// zurück, ob es geklappt hat — MarkKudosSeen.tsx soll bei einem
// fehlgeschlagenen RPC-Aufruf keinen router.refresh() auslösen, der einen
// erfolgreichen Abschluss vortäuschen würde.
export async function markKudosSeen(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.rpc("mark_kudos_seen");
  return { ok: !error };
}
