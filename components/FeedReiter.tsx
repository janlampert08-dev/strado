import Link from "next/link";
import { segmentClassName, segmentHuelleClassName } from "@/components/ui/SegmentedControl";

// Die drei Ansichten auf "was ist passiert, seit ich zuletzt geschaut
// habe": der globale Feed, der Feed der Konten, denen man folgt, und die
// eigene Aktivität.
//
// WARUM DIE AKTIVITÄT HIER STEHT UND NICHT MEHR IN DER LEISTE
//
// Sie beantwortet dieselbe Frage wie der Feed, nur aus der anderen
// Richtung: der Feed zeigt, was die anderen gefahren sind, die Aktivität,
// wie die anderen auf das eigene Fahren reagiert haben (Kudos, neue
// Follower). Zwei Antworten auf eine Frage gehören nebeneinander, nicht in
// zwei Bereiche.
//
// Der Platz in der mobilen Leiste, den sie dafür räumt, geht an die
// Ranglisten — die umgekehrt kein Blick auf den Feed sind, sondern eine
// Seite mit eigenen Daten, eigenem Filter und eigenem Anlass. Die
// Begründung für beide Richtungen steht in lib/nav.ts.
//
// Ein Reiter, der auf eine andere Adresse führt, ist immer noch ein Reiter:
// /aktivitaet bleibt eine eigene Seite mit eigenem Datenbedarf (zwei
// Abfragen, eigene Gesehen-Markierung) und rendert dieselbe Leiste mit
// "Aktivität" als aktivem Segment. Das ist deutlich weniger Umbau als beide
// Seiten zusammenzulegen — und der Nutzer sieht keinen Unterschied.
export type FeedAnsicht = "global" | "following" | "aktivitaet";

export default function FeedReiter({
  aktiv,
  /** Abgemeldete sehen "Folge ich" und "Aktivität" nicht — beides wäre eine
   *  leere Liste bzw. eine Umleitung auf /anmelden. */
  angemeldet,
  /** Ungesehene Kudos und neue Follower (0100). Als Zahl am Reiter, damit
   *  jemand, der gerade im Feed steht, sieht, dass es etwas zu holen gibt —
   *  dieselbe Zahl, die der Feed-Eintrag der Navigation trägt. */
  ungeseheneAktivitaet = 0,
}: {
  aktiv: FeedAnsicht;
  angemeldet: boolean;
  ungeseheneAktivitaet?: number;
}) {
  const reiter: { ansicht: FeedAnsicht; href: string; label: string; zaehler?: number }[] = [
    { ansicht: "global", href: "/feed", label: "Alle" },
    ...(angemeldet
      ? [
          { ansicht: "following" as const, href: "/feed?scope=following", label: "Folge ich" },
          {
            ansicht: "aktivitaet" as const,
            href: "/aktivitaet",
            label: "Aktivität",
            zaehler: ungeseheneAktivitaet,
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="Ansicht" className={segmentHuelleClassName("self-start")}>
      {reiter.map((r) => {
        const zeigtZaehler = (r.zaehler ?? 0) > 0;
        return (
          <Link
            key={r.ansicht}
            href={r.href}
            aria-current={r.ansicht === aktiv ? "page" : undefined}
            // Die Zahl steht als aria-hidden im Markup, also muss die
            // Beschriftung sie für Hilfstechnik mitbringen — sonst heisst
            // der Reiter dort schlicht "Aktivität", egal wie viel wartet.
            aria-label={
              zeigtZaehler
                ? `${r.label}, ${r.zaehler} ${r.zaehler === 1 ? "neue Reaktion" : "neue Reaktionen"}`
                : undefined
            }
            className={segmentClassName(r.ansicht === aktiv)}
          >
            {r.label}
            {zeigtZaehler && (
              <span
                aria-hidden="true"
                className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                  r.ansicht === aktiv
                    ? "bg-background text-foreground"
                    : "bg-accent text-background"
                }`}
              >
                {(r.zaehler ?? 0) > 9 ? "9+" : r.zaehler}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
