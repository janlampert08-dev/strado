import Link from "next/link";
import { ChevronDown } from "lucide-react";
import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import { MapPinIcon } from "@/components/NavIcons";
import PassStatusZeile from "@/components/PassStatusZeile";
import PassFolgenButton from "@/components/PassFolgenButton";
import PassKalenderAbschnitt from "@/components/PassKalenderAbschnitt";
import { anzeigeFuerStatus } from "@/lib/passStatus";
import { offenSeitText } from "@/lib/passKalender";
import type { PassKontext } from "@/lib/paesse";

// Der Passblock auf der Streckenseite. Er steht dort, wo er die Entscheidung
// trägt: vor Höhenprofil und Kennzahlen — denn ob der Pass überhaupt offen
// ist, kommt vor der Frage, wie steil er ist.
//
// Eine Strecke kann über mehrere Pässe führen (Grimsel und Furka an einem
// Nachmittag). Dann steht jeder für sich, statt zu einer Sammelaussage
// verrechnet zu werden: "einer von beiden zu" ist keine Information, mit der
// man losfährt.
export default function PassSektion({
  kontexte,
  angemeldet,
  feedStand,
}: {
  kontexte: PassKontext[];
  angemeldet: boolean;
  feedStand: string | null;
}) {
  if (kontexte.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading icon={MapPinIcon}>
        {kontexte.length === 1 ? "Pass" : "Pässe auf dieser Strecke"}
      </SectionHeading>

      {kontexte.map((kontext) => {
        const anzeige = anzeigeFuerStatus(
          kontext.status
            ? {
                zustand: kontext.status.zustand,
                meldung: kontext.status.meldung,
                quelle: kontext.status.quelle,
                aktualisiertAm: kontext.status.aktualisiertAm,
                manuellBis: kontext.status.manuellBis,
              }
            : null,
          feedStand,
        );
        const offenSeit = offenSeitText(
          anzeige.zustand,
          kontext.status?.seit ?? null,
          kontext.ereignisse,
        );

        return (
          <Card key={kontext.pass.id} className="flex flex-col gap-4 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-title font-semibold tracking-tight">
                  <Link href={`/paesse#${kontext.pass.id}`} className="hover:text-accent">
                    {kontext.pass.name}
                  </Link>
                </h3>
                <p className="text-xs text-muted">
                  {kontext.pass.hoeheM.toLocaleString("de-CH")} m · {kontext.pass.kantone.join(" / ")}
                </p>
              </div>
              <PassFolgenButton
                passId={kontext.pass.id}
                passName={kontext.pass.name}
                folgtMan={kontext.folgtMan}
                angemeldet={angemeldet}
              />
            </div>

            <PassStatusZeile anzeige={anzeige} />
            {offenSeit && <p className="text-sm text-muted">{offenSeit}</p>}

            <details className="group/kalender">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                Saison & Sperrungen
                <ChevronDown
                  className="h-4 w-4 transition-transform duration-fast group-open/kalender:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="pt-1">
                <PassKalenderAbschnitt
                  wintersperreAbMonat={kontext.pass.wintersperreAbMonat}
                  wintersperreBisMonat={kontext.pass.wintersperreBisMonat}
                  sperrtage={kontext.sperrtage}
                  ereignisse={kontext.ereignisse}
                />
              </div>
            </details>
          </Card>
        );
      })}
    </section>
  );
}
