import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getRecentKudosReceived } from "@/lib/kudos";
import { getRecentFollowersReceived } from "@/lib/follows";
import { mischeAktivitaet, type AktivitaetsEintrag } from "@/lib/aktivitaet";

// Die Abfrageseite der Aktivität — getrennt von lib/aktivitaet.ts, weil
// jene Datei auch in der Client-Komponente landet (siehe Kopf dort) und
// alles hier den Server-Client braucht.

// Beide Listen in einer gemischten Zeitachse — die Datenquelle für
// /aktivitaet. Die zwei RPCs hängen nicht voneinander ab, laufen also
// nebenläufig.
export async function getAktivitaet(): Promise<AktivitaetsEintrag[]> {
  const [kudos, follower] = await Promise.all([
    getRecentKudosReceived(),
    getRecentFollowersReceived(),
  ]);
  return mischeAktivitaet(kudos, follower);
}

// Ungesehene Reaktionen insgesamt (Kudos + neue Follower), für das
// Abzeichen in der Kopfleiste. Ein RPC statt zweier, siehe
// count_unseen_activity in 0100_folge_benachrichtigungen.sql — <Header />
// läuft auf jeder Seite.
//
// Mit React cache() umschlossen aus demselben Grund wie
// getUnseenKudosCount (lib/kudos.ts): /aktivitaet braucht dieselbe Zahl
// noch einmal, um MarkSeen nur bei Bedarf feuern zu lassen.
export const getUnseenActivityCount = cache(async function getUnseenActivityCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_unseen_activity");
  if (error || data == null) return 0;
  return Number(data);
});
