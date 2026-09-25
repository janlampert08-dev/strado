"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { formatZeitpunkt } from "@/lib/format";
import { useRouter } from "next/navigation";
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
  //
  // Schlüssel ist Person UND Zeitpunkt: fragt jemand nach einer Ablehnung
  // erneut an, ist das eine neue Anfrage und soll erscheinen.
  const [beantwortet, setBeantwortet] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Die beantwortete Karte verschwindet samt dem fokussierten Knopf —
  // der Fokus geht an den Abschnitt (liest seine Überschrift vor) statt an
  // <body>.
  const ueberschriftRef = useRef<HTMLElement>(null);
  const anfragen = initial.filter((a) => !beantwortet.has(schluessel(a)));

  // Der "neu"-Punkt als Stand beim Laden, wie in ActivityList: MarkSeen
  // markiert direkt danach alles als gesehen und lädt neu — ohne diesen
  // Schnappschuss verschwände der Punkt, bevor ihn jemand sieht.
  const [neuBeimLaden] = useState<ReadonlySet<string>>(
    () => new Set(initial.filter((a) => a.neu).map(schluessel)),
  );

  if (anfragen.length === 0) return null;

  function beantworte(anfrage: Folgeanfrage, annehmen: boolean) {
    // Optimistisch ausblenden; bei einem Fehler wieder an ihren Platz.
    setBeantwortet((s) => new Set(s).add(schluessel(anfrage)));
    // War es die letzte Anfrage, verschwindet der ganze Abschnitt — dann an
    // die Seitenüberschrift, die sicher stehen bleibt.
    if (anfragen.length <= 1) {
      document.getElementById("aktivitaet-titel")?.focus();
    } else {
      ueberschriftRef.current?.focus();
    }
    startTransition(async () => {
      const { ok } = annehmen
        ? await folgeanfrageAnnehmen(anfrage.von)
        : await folgeanfrageAblehnen(anfrage.von);
      if (!ok) {
        setBeantwortet((s) => {
          const neu = new Set(s);
          neu.delete(schluessel(anfrage));
          return neu;
        });
        // Meist ist die Anfrage inzwischen zurückgezogen — neu laden, damit
        // keine Karte stehen bleibt, die nie mehr gelingen kann.
        router.refresh();
        zeigeHinweis("Das hat nicht geklappt — die Liste ist jetzt aktualisiert.");
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
    <section
      ref={ueberschriftRef}
      tabIndex={-1}
      aria-labelledby="folgeanfragen-titel"
      className="flex flex-col gap-3 outline-none"
    >
      <SectionHeading as="h2" groesse="xs" id="folgeanfragen-titel">
        Folgeanfragen ({anfragen.length})
      </SectionHeading>
      <ul className="flex flex-col gap-3">
        {anfragen.map((anfrage) => (
          <Card as="li" key={schluessel(anfrage)} className="flex flex-col gap-3 p-4">
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
                  {formatZeitpunkt(anfrage.erstelltAm)}
                </p>
              </Link>
              {neuBeimLaden.has(schluessel(anfrage)) && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent">
                  <span className="sr-only">Neu</span>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => beantworte(anfrage, true)}
                aria-label={`Anfrage von ${anfrage.displayName ?? "Fahrer"} annehmen`}
                className={buttonVariants({ variant: "accent", size: "sm", className: "flex-1" })}
              >
                Annehmen
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => beantworte(anfrage, false)}
                aria-label={`Anfrage von ${anfrage.displayName ?? "Fahrer"} ablehnen`}
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

function schluessel(anfrage: Folgeanfrage): string {
  return `${anfrage.von}|${anfrage.erstelltAm}`;
}
