import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getRecentKudosReceived } from "@/lib/kudos";
import { getRecentFollowersReceived } from "@/lib/follows";
import { mischeAktivitaet, type AktivitaetsEintrag, type PassEintrag } from "@/lib/aktivitaet";

// Die Abfrageseite der Aktivität — getrennt von lib/aktivitaet.ts, weil
// jene Datei auch in der Client-Komponente landet (siehe Kopf dort) und
// alles hier den Server-Client braucht.

// Beide Listen in einer gemischten Zeitachse — die Datenquelle für
// /aktivitaet. Die zwei RPCs hängen nicht voneinander ab, laufen also
// nebenläufig.
export async function getAktivitaet(): Promise<AktivitaetsEintrag[]> {
  // getCurrentUser() ist per React cache() dedupliziert — die Seite hat
  // dieselbe Sitzung eben schon gelesen, das kostet keinen Roundtrip.
  const [kudos, follower, paesse, user] = await Promise.all([
    getRecentKudosReceived(),
    getRecentFollowersReceived(),
    getPassMeldungen(),
    getCurrentUser(),
  ]);
  return mischeAktivitaet(kudos, follower, paesse, user?.id ?? null);
}

/**
 * Statuswechsel der Pässe, denen das angemeldete Konto folgt.
 *
 * Die Funktion in der Datenbank (0104) liefert nur Wechsel NACH dem Folgen
 * und nur die, die eine Fahrt entscheiden — auf und zu, nicht jede
 * Kettenpflicht. Ohne Konto gibt sie nichts zurück.
 */
async function getPassMeldungen(): Promise<PassEintrag[]> {
  const supabase = await createClient();
  interface MeldungsZeile {
    pass_id: string;
    pass_name: string;
    zustand: PassEintrag["zustand"];
    vorher: PassEintrag["vorher"];
    erfasst_am: string;
    neu: boolean;
  }

  const { data, error } = await supabase.rpc("recent_pass_meldungen");

  if (error) {
    console.error("Passmeldungen konnten nicht geladen werden", error);
    return [];
  }

  return ((data as MeldungsZeile[] | null) ?? []).map((zeile) => ({
    art: "pass" as const,
    passId: zeile.pass_id,
    passName: zeile.pass_name,
    zustand: zeile.zustand,
    vorher: zeile.vorher,
    erstelltAm: zeile.erfasst_am,
    neu: zeile.neu,
  }));
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
