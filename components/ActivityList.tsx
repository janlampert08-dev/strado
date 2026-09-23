"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import { AktivitaetIcon, BergIcon } from "@/components/NavIcons";
import { aktivitaetsSchluessel, passMeldungText, type AktivitaetsEintrag } from "@/lib/aktivitaet";

// Die Liste selbst kommt LIVE aus den Props, die "neu"-Markierungen aus
// einem Schnappschuss des ersten Rendervorgangs. Die Trennung ist der
// ganze Witz dieser Komponente, und sie hat zwei Gegenspieler:
//
//  * MarkSeen (siehe app/aktivitaet/page.tsx) loest nach dem Laden ein
//    router.refresh() aus. Dabei werten recent_kudos_received() und
//    recent_follows_received() gegen die gerade erst aktualisierten
//    "gesehen"-Zeitpunkte neu aus — jedes neu-Flag waere sofort false,
//    noch bevor der Nutzer die Markierung gesehen hat.
//  * PullToRefreshArea loest DASSELBE router.refresh() aus, diesmal aber
//    ausdruecklich vom Nutzer angefordert: er will neue Kudos und
//    Follower sehen, und eine Fahrt, der jemand wieder entfolgt ist, soll
//    verschwinden.
//
// Ein useState-Schnappschuss ueber den ganzen Eintrag bediente den ersten
// Fall und brach den zweiten: die Liste stand fest, und Ziehen zum
// Neuladen tat sichtbar nichts. Deshalb wird nur das gemerkt, was der
// Refresh kaputtmacht — die Menge der beim Laden neuen Eintraege —, und
// alles uebrige kommt aus den frischen Props.
export default function ActivityList({
  initialEintraege,
}: {
  initialEintraege: AktivitaetsEintrag[];
}) {
  // Nur die Schluessel, nicht die Eintraege: der Initialisierer laeuft
  // einmal, spaetere Props aendern die Menge nicht mehr.
  const [neuBeimLaden] = useState(
    () =>
      new Set(
        initialEintraege.filter((e) => e.neu).map((e) => aktivitaetsSchluessel(e)),
      ),
  );

  const eintraege = initialEintraege.map((eintrag) =>
    neuBeimLaden.has(aktivitaetsSchluessel(eintrag)) ? { ...eintrag, neu: true } : eintrag,
  );

  if (eintraege.length === 0) {
    return (
      <EmptyState
        icon={AktivitaetIcon}
        title="Noch keine Neuigkeiten."
        description="Wer deinen geteilten Fahrten Kudos gibt oder dir folgt, steht hier — und wenn ein Pass, dem du folgst, öffnet oder schliesst."
        action={
          <Link href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
            Strecken entdecken
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {eintraege.map((eintrag) =>
        // Die Passmeldung ist die eine Zeile ohne Person: statt Avatar und
        // Name steht der Pass da, und der Link führt auf seine Strecke.
        eintrag.art === "pass" ? (
          <Card as="li" key={aktivitaetsSchluessel(eintrag)} className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface">
              <BergIcon className="h-5 w-5 text-muted" aria-hidden="true" />
            </span>
            <Link
              href={`/paesse#${eintrag.passId}`}
              className="min-w-0 flex-1 transition-colors duration-fast hover:text-accent-ink"
            >
              <p className="flex items-center text-sm">
                <span className="truncate font-medium">{eintrag.passName}</span>
                <span className="ml-1 truncate">{passMeldungText(eintrag)}</span>
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
            {eintrag.neu && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Neu" />
            )}
          </Card>
        ) : (
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
            className="min-w-0 flex-1 transition-colors duration-fast hover:text-accent-ink"
          >
            {/* Flex statt eines einzelnen truncate-<p>: in einem Block mit
                truncate wirkt shrink-0 am Abzeichen nicht, weil es keinen
                Flex-Container gibt — die Ellipse kann dann mitten im Satz
                stehen und das Zeichen mitnehmen. Hier kürzen Name und
                Nachsatz unabhängig, das Zeichen dazwischen bleibt. Gleiche
                Lösung wie in der Feed-Karte (app/feed/page.tsx). */}
            <p className="flex items-center text-sm">
              <span className="truncate font-medium">{eintrag.personName ?? "Ein Fahrer"}</span>
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
        ),
      )}
    </ul>
  );
}
