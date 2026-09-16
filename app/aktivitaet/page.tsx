import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PullToRefreshArea from "@/components/PullToRefreshArea";
import MarkSeen from "@/components/MarkSeen";
import ActivityList from "@/components/ActivityList";
import { getAktivitaet, getUnseenActivityCount } from "@/lib/aktivitaetsliste";
import { markActivitySeen } from "@/lib/actions/aktivitaet";
import { getCurrentUser } from "@/lib/supabase/server";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

export const metadata = {
  title: "Aktivität – Strado",
};

// Eigene Seite für "Community reagiert" im Kernloop (siehe AGENTS.md, "Core
// User Loop", Schritt 7→8) statt nur eines Badges auf dem Profil-Tab — das
// Flammen-Icon im Header verlinkt hierher (Header.tsx, auf jeder
// Bildschirmgrösse sichtbar), analog zum bisherigen Ungelesen-Zähler.
//
// Zwei Arten von Reaktion, eine Zeitachse: Kudos auf eigenen Fahrten
// (recent_kudos_received, 0057) und neue Follower (recent_follows_received,
// 0100). Beide Funktionen sind ausschliesslich auf auth.uid() beschränkt —
// niemand kann die Aktivität eines fremden Kontos abfragen.
export default async function AktivitaetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");

  // getUnseenActivityCount zählt über alle Kudos und Follower, die Listen
  // liefern nur die letzten 30 (0057/0100). Beides wird gebraucht: die Liste
  // zum Anzeigen, die Zahl als Schalter fürs Markieren — siehe unten. Beide
  // Aufrufe sind per React cache() dedupliziert, der Header fragt dieselbe
  // Zahl ohnehin.
  const [eintraege, ungesehen] = await Promise.all([getAktivitaet(), getUnseenActivityCount()]);

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      {/* Markiert beim Laden alles aktuell Ungesehene als gesehen, siehe
          MarkSeen.tsx — hier mit markActivitySeen, das BEIDE Zeitpunkte
          setzt (0100). Auf /profil läuft dieselbe Komponente mit
          markKudosSeen, weil dort nur die Kudos zu sehen sind.
          Das router.refresh() darin würde die "neu"-Flags dieser Liste
          sofort auf false ziehen, bevor der Nutzer sie gesehen hat —
          deshalb hält ActivityList einen eigenen Snapshot statt live aus
          den Props neu zu lesen. Ohne Ungesehenes gibt es nichts zu
          markieren — dann bleibt auch der Refresh aus.

          Der Schalter kommt aus getUnseenActivityCount und NICHT aus dieser
          Liste: sie ist bei 30 Einträgen gekappt. Wer mehr Reaktionen
          bekommen hat, dessen ältestes ungesehenes fiele aus dem Fenster,
          die Liste meldete "nichts Neues", markiert würde nichts — und das
          Abzeichen in der Kopfleiste, das über alle zählt, bliebe nach dem
          Besuch dieser Seite stehen. */}
      <MarkSeen hasUnseen={ungesehen > 0} markSeen={markActivitySeen} />
      {/* Ziehen zum Aktualisieren (nur Touch) — siehe PullToRefreshArea.tsx */}
      <PullToRefreshArea>
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen>
          <div>
            <h1 className="text-display font-semibold">Aktivität</h1>
            <p className="mt-1 text-sm text-muted">
              Kudos auf deine geteilten Fahrten und neue Follower.
            </p>
          </div>

          <ActivityList initialEintraege={eintraege} />
        </Seitenrahmen>
      </div>
      </PullToRefreshArea>
    </div>
  );
}
