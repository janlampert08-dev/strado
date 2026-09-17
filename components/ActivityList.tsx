"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { AktivitaetIcon, PassIcon } from "@/components/NavIcons";
import { aktivitaetsSchluessel, type AktivitaetsEintrag } from "@/lib/aktivitaet";

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
        title="Noch nichts passiert — teile eine Fahrt, dann kommen Kudos und Follower."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {eintraege.map((eintrag) => (
        <Card as="li" key={aktivitaetsSchluessel(eintrag)} className="flex items-center gap-3 p-4">
          {eintrag.art === "pass_offen" ? (
            // Pass-Alarm (0112): kein Mensch hat reagiert, also kein Avatar.
            // Dieselbe 40-px-Fläche, damit die Textspalte in einer Flucht
            // mit den Reaktionen darunter bleibt.
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted"
            >
              <PassIcon className="h-5 w-5" />
            </span>
          ) : (
            <Avatar url={eintrag.personAvatarUrl} name={eintrag.personName} size={40} />
          )}
          {/* Kudos führen zur Fahrt, um die es geht; ein neuer Follower zu
              der Person, die gefolgt ist — das ist dort die einzige
              sinnvolle Anschlusshandlung (ansehen, zurückfolgen). Eine
              Passöffnung führt zur Strecke, wo Status und Prüfdatum stehen. */}
          <Link
            href={
              eintrag.art === "kudos"
                ? `/fahrten/${eintrag.completionId}`
                : eintrag.art === "follower"
                  ? `/fahrer/${eintrag.personId}`
                  : `/strecken/${eintrag.routeId}`
            }
            className="min-w-0 flex-1 transition-colors duration-fast hover:text-accent"
          >
            {/* Flex statt eines einzelnen truncate-<p>: in einem Block mit
                truncate wirkt shrink-0 am Abzeichen nicht, weil es keinen
                Flex-Container gibt — die Ellipse kann dann mitten im Satz
                stehen und das Zeichen mitnehmen. Hier kürzen Name und
                Nachsatz unabhängig, das Zeichen dazwischen bleibt. Gleiche
                Lösung wie in der Feed-Karte (app/feed/page.tsx). */}
            {eintrag.art === "pass_offen" ? (
              <p className="flex items-center text-sm">
                <span className="truncate font-medium">{eintrag.routeName}</span>
                <span className="ml-1 shrink-0">ist offen</span>
              </p>
            ) : (
              <p className="flex items-center text-sm">
                <span className="truncate font-medium">{eintrag.personName ?? "Ein Fahrer"}</span>
                <span className="ml-1 truncate">
                  {eintrag.art === "kudos" ? "hat deiner Fahrt Kudos gegeben" : "folgt dir jetzt"}
                </span>
              </p>
            )}
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
