import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PullToRefreshArea from "@/components/PullToRefreshArea";
import MarkKudosSeen from "@/components/MarkKudosSeen";
import ActivityKudosList from "@/components/ActivityKudosList";
import { getRecentKudosReceived } from "@/lib/kudos";
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
/**
 * Displays the authenticated user's activity page with recently received kudos.
 *
 * @returns The rendered activity page.
 */
export default async function AktivitaetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  const kudosList = await getRecentKudosReceived();

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      {/* Markiert beim Laden alle aktuell ungelesenen Kudos als gesehen,
          siehe MarkKudosSeen.tsx — dieselbe Komponente wie bisher auf
          /profil, hier zusätzlich statt stattdessen. Das router.refresh()
          darin würde die "neu"-Flags dieser Liste sofort auf false ziehen,
          bevor der Nutzer sie gesehen hat — deshalb hält ActivityKudosList
          einen eigenen Snapshot statt live aus den Props neu zu lesen. */}
      <MarkKudosSeen />
      {/* Ziehen zum Aktualisieren (nur Touch) — siehe PullToRefreshArea.tsx */}
      <PullToRefreshArea>
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
          <div>
            <h1 className="text-display font-semibold">Aktivität</h1>
            <p className="mt-1 text-sm text-muted">Kudos auf deine geteilten Fahrten.</p>
          </div>

          <ActivityKudosList initialKudosList={kudosList} />
        </main>
      </div>
      </PullToRefreshArea>
    </div>
  );
}
