"use server";

import { createClient } from "@/lib/supabase/server";

// Markiert Kudos UND neue Follower als gesehen (mark_activity_seen,
// 0097_folge_benachrichtigungen.sql) — aufgerufen beim Laden von
// /aktivitaet, wo beides nebeneinander steht. Setzt damit das Abzeichen in
// der Kopfleiste zurück (lib/aktivitaet.ts, getUnseenActivityCount).
//
// Bewusst getrennt von markKudosSeen (lib/actions/kudos.ts): /profil zeigt
// nur die eigenen Fahrten und darf deshalb weiterhin nur die Kudos
// abräumen. Wer dort auch die Follower als gesehen markierte, liesse eine
// Meldung verschwinden, die der Nutzer nie zu Gesicht bekommen hat.
//
// Gibt zurück, ob es geklappt hat — MarkSeen.tsx soll bei einem
// fehlgeschlagenen RPC keinen router.refresh() auslösen, der einen
// erfolgreichen Abschluss vortäuschen würde.
export async function markActivitySeen(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.rpc("mark_activity_seen");
  return { ok: !error };
}
