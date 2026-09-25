import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PullToRefreshArea from "@/components/PullToRefreshArea";
import MarkSeen from "@/components/MarkSeen";
import ActivityList from "@/components/ActivityList";
import FolgeanfragenListe from "@/components/FolgeanfragenListe";
import { getOffeneFolgeanfragen } from "@/lib/follows";
import FeedReiter from "@/components/FeedReiter";
import { getAktivitaet, getUnseenActivityCount } from "@/lib/aktivitaetsliste";
import { markActivitySeen } from "@/lib/actions/aktivitaet";
import { getCurrentUser } from "@/lib/supabase/server";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

export const metadata = {
  title: "Aktivität – Strado",
};

// Eigene Seite für "Community reagiert" im Kernloop (siehe AGENTS.md, "Core
// User Loop", Schritt 7→8) — erreichbar als dritter Reiter des Feeds
// (components/FeedReiter.tsx). Feed und Aktivität beantworten dieselbe
// Frage aus zwei Richtungen: was die anderen gefahren sind, und wie die
// anderen auf das eigene Fahren reagiert haben. Der Zähler ungesehener
// Reaktionen sitzt deshalb am Feed-Eintrag der Navigation und am Reiter
// hier; die Begründung für die Zuordnung steht in lib/nav.ts.
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
  // Offene Folgeanfragen (0146) stehen über der Zeitachse, bis sie
  // beantwortet sind — siehe FolgeanfragenListe.
  const [eintraege, ungesehen, anfragen] = await Promise.all([
    getAktivitaet(),
    getUnseenActivityCount(),
    getOffeneFolgeanfragen(),
  ]);

  return (
    <div className="flex h-dvh flex-col">
      <Header />
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
            {/* tabIndex -1: Ziel für den Fokus, wenn die letzte Folgeanfrage
                beantwortet ist und ihr Abschnitt verschwindet. */}
            <h1 id="aktivitaet-titel" tabIndex={-1} className="text-display font-semibold outline-none">
              Aktivität
            </h1>
            <p className="mt-1 text-sm text-muted">
              Folgeanfragen, Kudos auf deine geteilten Fahrten und neue Follower.
            </p>
          </div>

          {/* Dieselbe Reiterleiste wie auf /feed. Ohne sie wäre diese Seite
              eine Sackgasse: der Weg hierher führt über den Feed, der Weg
              zurück führte nur über die Kopfleiste.

              ungeseheneAktivitaet bleibt hier bei 0 (Vorgabe): MarkSeen
              oben setzt beim Laden alles auf gesehen, eine Zahl am aktiven
              Reiter wäre also im selben Moment falsch. */}
          <FeedReiter aktiv="aktivitaet" angemeldet />

          <FolgeanfragenListe initial={anfragen} />

          <ActivityList initialEintraege={eintraege} hatFolgeanfragen={anfragen.length > 0} />
        </Seitenrahmen>
      </div>
      </PullToRefreshArea>
    </div>
  );
}
