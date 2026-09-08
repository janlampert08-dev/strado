import { redirect } from "next/navigation";
import Header from "@/components/Header";
import MarkKudosSeen from "@/components/MarkKudosSeen";
import ActivityKudosList from "@/components/ActivityKudosList";
import { getRecentKudosReceived, getUnseenKudosCount } from "@/lib/kudos";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Aktivität – Strado",
};

// Eigene Seite für "Community reagiert" im Kernloop (siehe AGENTS.md, "Core
// User Loop", Schritt 7→8) statt nur eines Badges auf dem Profil-Tab — das
// Flammen-Icon im Header verlinkt hierher (Header.tsx, auf jeder
// Bildschirmgrösse sichtbar), analog zum bisherigen Ungelesen-Zähler
// (lib/kudos.ts, getUnseenKudosCount). Nur der Besitzer selbst sieht seine
// eigene Liste, siehe recent_kudos_received
// (0057_kudos_aktivitaetsliste.sql) — ausschliesslich auf auth.uid()
// beschränkt.
export default async function AktivitaetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  // getUnseenKudosCount zählt über alle Kudos, recent_kudos_received liefert
  // nur die letzten 30 (0057). Beides wird gebraucht: die Liste zum Anzeigen,
  // die Zahl als Schalter fürs Markieren — siehe unten. Beide Aufrufe sind
  // per React cache() dedupliziert, der Header fragt dieselbe Zahl ohnehin.
  const [kudosList, ungeleseneKudos] = await Promise.all([
    getRecentKudosReceived(),
    getUnseenKudosCount(),
  ]);

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      {/* Markiert beim Laden alle aktuell ungelesenen Kudos als gesehen,
          siehe MarkKudosSeen.tsx — dieselbe Komponente wie bisher auf
          /profil, hier zusätzlich statt stattdessen. Das router.refresh()
          darin würde die "neu"-Flags dieser Liste sofort auf false ziehen,
          bevor der Nutzer sie gesehen hat — deshalb hält ActivityKudosList
          einen eigenen Snapshot statt live aus den Props neu zu lesen.
          Ohne ungelesene Kudos gibt es nichts zu markieren — dann bleibt
          auch der Refresh aus.

          Der Schalter kommt aus getUnseenKudosCount und NICHT aus dieser
          Liste: sie ist bei 30 Einträgen gekappt. Wer mehr Kudos bekommen
          hat, dessen ältestes ungelesenes fiele aus dem Fenster, die Liste
          meldete "nichts Neues", markiert würde nichts — und das Abzeichen
          in der Kopfleiste, das über alle zählt, bliebe nach dem Besuch
          dieser Seite stehen. */}
      <MarkKudosSeen hasUnseen={ungeleseneKudos > 0} />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
          <div>
            <h1 className="text-display font-semibold">Aktivität</h1>
            <p className="mt-1 text-sm text-muted">Kudos auf deine geteilten Fahrten.</p>
          </div>

          <ActivityKudosList initialKudosList={kudosList} />
        </main>
      </div>
    </div>
  );
}
