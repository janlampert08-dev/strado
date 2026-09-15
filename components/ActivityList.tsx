"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import PremiumSignet from "@/components/PremiumSignet";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { AktivitaetIcon } from "@/components/NavIcons";
import { aktivitaetsSchluessel, type AktivitaetsEintrag } from "@/lib/aktivitaet";

// Snapshot beim ersten Rendern statt live aus den Props abgeleitet:
// MarkSeen (siehe app/aktivitaet/page.tsx) löst nach dem Laden ein
// router.refresh() aus, das auch diese Seite serverseitig neu rendert —
// ohne den eigenen State würden recent_kudos_received() und
// recent_follows_received() beim Refresh gegen die gerade erst
// aktualisierten "gesehen"-Zeitpunkte neu auswerten und jedes "neu"-Flag
// wäre sofort false, noch bevor der Nutzer die Liste überhaupt gesehen hat
// (die Markierung wäre witzlos). initialEintraege spiegelt bewusst nur den
// Stand beim ersten Laden der Seite.
export default function ActivityList({
  initialEintraege,
}: {
  initialEintraege: AktivitaetsEintrag[];
}) {
  const [eintraege] = useState(initialEintraege);

  if (eintraege.length === 0) {
    return (
      <EmptyState
        icon={AktivitaetIcon}
        title="Noch nichts passiert — teile eine Fahrt, dann kommen Kudos und Follower."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {eintraege.map((eintrag) => (
        <Card as="li" key={aktivitaetsSchluessel(eintrag)} className="flex items-center gap-3 p-4">
          <Avatar url={eintrag.personAvatarUrl} name={eintrag.personName} size={40} />
          {/* Kudos führen zur Fahrt, um die es geht; ein neuer Follower zu
              der Person, die gefolgt ist — das ist dort die einzige
              sinnvolle Anschlusshandlung (ansehen, zurückfolgen). */}
          <Link
            href={
              eintrag.art === "kudos"
                ? `/fahrten/${eintrag.completionId}`
                : `/fahrer/${eintrag.personId}`
            }
            className="min-w-0 flex-1 transition-colors duration-fast hover:text-accent"
          >
            {/* Flex statt eines einzelnen truncate-<p>: in einem Block mit
                truncate wirkt shrink-0 am Abzeichen nicht, weil es keinen
                Flex-Container gibt — die Ellipse kann dann mitten im Satz
                stehen und das Zeichen mitnehmen. Hier kürzen Name und
                Nachsatz unabhängig, das Zeichen dazwischen bleibt. Gleiche
                Lösung wie in der Feed-Karte (app/feed/page.tsx). */}
            <p className="flex items-center text-sm">
              <span className="truncate font-medium">{eintrag.personName ?? "Ein Fahrer"}</span>
              <PremiumSignet zeigen={eintrag.personZeigtPremiumAbzeichen} />
              <span className="ml-1 truncate">
                {eintrag.art === "kudos" ? "hat deiner Fahrt Kudos gegeben" : "folgt dir jetzt"}
              </span>
            </p>
            <p className="text-xs text-muted">
              {new Date(eintrag.erstelltAm).toLocaleString("de-CH", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </Link>
          {eintrag.neu && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Neu" />}
        </Card>
      ))}
    </ul>
  );
}
