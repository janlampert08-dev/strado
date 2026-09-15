"use client";

import { useState } from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import Avatar from "@/components/Avatar";
import PremiumSignet from "@/components/PremiumSignet";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import type { ReceivedKudos } from "@/lib/kudos";

// Snapshot beim ersten Rendern statt live aus den Props abgeleitet:
// MarkKudosSeen (siehe app/aktivitaet/page.tsx) löst nach dem Laden ein
// router.refresh() aus, das auch diese Seite serverseitig neu rendert —
// ohne den eigenen State würde recent_kudos_received() beim Refresh gegen
// das gerade erst aktualisierte kudos_gesehen_am neu auswerten und jedes
// "neu"-Flag wäre sofort false, noch bevor der Nutzer die Liste überhaupt
// gesehen hat (die Markierung wäre witzlos). initialKudosList spiegelt
// bewusst nur den Stand beim ersten Laden der Seite.
export default function ActivityKudosList({
  initialKudosList,
}: {
  initialKudosList: ReceivedKudos[];
}) {
  const [kudosList] = useState(initialKudosList);

  if (kudosList.length === 0) {
    return <EmptyState icon={Flame} title="Noch keine Kudos — teile eine Fahrt, dann kommen sie." />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {kudosList.map((kudos) => (
        <Card
          as="li"
          key={`${kudos.completionId}-${kudos.giverId}`}
          className="flex items-center gap-3 p-4"
        >
          <Avatar url={kudos.giverAvatarUrl} name={kudos.giverDisplayName} size={40} />
          <Link
            href={`/fahrten/${kudos.completionId}`}
            className="min-w-0 flex-1 transition-colors duration-fast hover:text-accent"
          >
            {/* Flex statt eines einzelnen truncate-<p>: in einem Block mit
                truncate wirkt shrink-0 am Abzeichen nicht, weil es keinen
                Flex-Container gibt — die Ellipse kann dann mitten im Satz
                stehen und das Zeichen mitnehmen. Hier kürzen Name und
                Nachsatz unabhängig, das Zeichen dazwischen bleibt. Gleiche
                Lösung wie in der Feed-Karte (app/feed/page.tsx). */}
            <p className="flex items-center text-sm">
              <span className="truncate font-medium">
                {kudos.giverDisplayName ?? "Ein Fahrer"}
              </span>
              <PremiumSignet zeigen={kudos.giverZeigtPremiumAbzeichen} />
              <span className="ml-1 truncate">hat deiner Fahrt Kudos gegeben</span>
            </p>
            <p className="text-xs text-muted">
              {new Date(kudos.erstelltAm).toLocaleString("de-CH", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </Link>
          {kudos.neu && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Neu" />}
        </Card>
      ))}
    </ul>
  );
}
