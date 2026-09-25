"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import { buttonVariants } from "@/components/ui/Button";
import { zeigeHinweis } from "@/components/Hinweis";
import { folgeanfrageAblehnen, folgeanfrageAnnehmen } from "@/lib/actions/follows";
import type { Folgeanfrage } from "@/lib/follows";

// Offene Folgeanfragen oben auf /aktivitaet (0146). Bewusst eine eigene
// Liste über der Zeitachse statt einer Zeile darin: eine Anfrage wartet
// auf eine Antwort, eine Reaktion nicht. Sie bleibt stehen, bis sie
// beantwortet ist — auch nachdem die Seite sie als gesehen markiert hat.
// Angenommen erscheint die Person unten als neuer Follower.
export default function FolgeanfragenListe({ initial }: { initial: Folgeanfrage[] }) {
  // Die Liste kommt immer aus den Props — neue Serverdaten (Ziehen zum
  // Aktualisieren, revalidatePath nach einer Antwort) erscheinen so sofort,
  // eine zurückgezogene Anfrage verschwindet. Lokal gemerkt wird nur, was
  // gerade beantwortet wurde, damit die Karte nicht bis zur Antwort des
  // Servers stehen bleibt.
  const [beantwortet, setBeantwortet] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const anfragen = initial.filter((a) => !beantwortet.has(a.von));

  if (anfragen.length === 0) return null;

  function beantworte(anfrage: Folgeanfrage, annehmen: boolean) {
    // Optimistisch ausblenden; bei einem Fehler wieder an ihren Platz.
    setBeantwortet((s) => new Set(s).add(anfrage.von));
    startTransition(async () => {
      const { ok } = annehmen
        ? await folgeanfrageAnnehmen(anfrage.von)
        : await folgeanfrageAblehnen(anfrage.von);
      if (!ok) {
        setBeantwortet((s) => {
          const neu = new Set(s);
          neu.delete(anfrage.von);
          return neu;
        });
        zeigeHinweis("Das hat nicht geklappt. Bitte versuche es noch einmal.");
        return;
      }
      zeigeHinweis(
        annehmen
          ? `${anfrage.displayName ?? "Die Person"} folgt dir jetzt.`
          : "Anfrage abgelehnt.",
      );
    });
  }

  return (
    <section aria-labelledby="folgeanfragen-titel" className="flex flex-col gap-3">
      <SectionHeading as="h2" groesse="xs" id="folgeanfragen-titel">
        Folgeanfragen ({anfragen.length})
      </SectionHeading>
      <ul className="flex flex-col gap-3">
        {anfragen.map((anfrage) => (
          <Card as="li" key={anfrage.von} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Avatar url={anfrage.avatarUrl} name={anfrage.displayName} size={40} />
              <Link
                href={`/fahrer/${anfrage.von}`}
                className="min-w-0 flex-1 transition-colors duration-fast hover:text-accent-ink"
              >
                <p className="flex items-center text-sm">
                  <span className="truncate font-medium">{anfrage.displayName ?? "Ein Fahrer"}</span>
                  <span className="ml-1 truncate">möchte dir folgen</span>
                </p>
                <p className="text-xs text-muted">
                  {new Date(anfrage.erstelltAm).toLocaleString("de-CH", {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </Link>
              {anfrage.neu && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Neu" />}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => beantworte(anfrage, true)}
                className={buttonVariants({ variant: "accent", size: "sm", className: "flex-1" })}
              >
                Annehmen
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => beantworte(anfrage, false)}
                className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}
              >
                Ablehnen
              </button>
            </div>
          </Card>
        ))}
      </ul>
    </section>
  );
}
