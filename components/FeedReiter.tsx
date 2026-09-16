import Link from "next/link";
import { segmentClassName, segmentHuelleClassName } from "@/components/ui/SegmentedControl";

// Die drei Ansichten auf "was andere gefahren sind": der globale Feed, der
// Feed der Konten, denen man folgt, und die Ranglisten.
//
// WARUM DIE BESTENLISTEN HIER STEHEN UND NICHT MEHR IN DER LEISTE
//
// /leaderboards kommt in keinem der neun Schritte des Kernloops vor
// (AGENTS.md) und hielt trotzdem einen der fünf Plätze in der mobilen
// Navigation — während /aktivitaet, das Schritt 8 IST, nur über ein
// 20-px-Symbol im Kopf erreichbar war. Der Tausch ist in lib/nav.ts
// beschrieben und in docs/design-vereinfachung.md Abschnitt 3b begründet.
//
// Die Rangliste verschwindet dabei nicht, sie zieht dorthin, wo man ohnehin
// schaut, was andere gefahren sind. Die Reiter gab es auf /feed bereits
// ("Alle" / "Folge ich"); es kommt einer dazu.
//
// Ein Reiter, der auf eine andere Adresse führt, ist immer noch ein Reiter:
// /leaderboards bleibt eine eigene Seite mit eigenem Datenbedarf (vier
// Listen, Motorklassen-Filter) und rendert dieselbe Leiste mit "Rangliste"
// als aktivem Segment. Das ist deutlich weniger Umbau als beide Seiten
// zusammenzulegen — und der Nutzer sieht keinen Unterschied.
export type FeedAnsicht = "global" | "following" | "rangliste";

export default function FeedReiter({
  aktiv,
  /** Abgemeldete sehen "Folge ich" nicht — es wäre eine leere Liste. */
  zeigtFolgeIch,
}: {
  aktiv: FeedAnsicht;
  zeigtFolgeIch: boolean;
}) {
  const reiter: { ansicht: FeedAnsicht; href: string; label: string }[] = [
    { ansicht: "global", href: "/feed", label: "Alle" },
    ...(zeigtFolgeIch
      ? [{ ansicht: "following" as const, href: "/feed?scope=following", label: "Folge ich" }]
      : []),
    { ansicht: "rangliste", href: "/leaderboards", label: "Rangliste" },
  ];

  return (
    <nav aria-label="Ansicht" className={segmentHuelleClassName("self-start")}>
      {reiter.map((r) => (
        <Link
          key={r.ansicht}
          href={r.href}
          aria-current={r.ansicht === aktiv ? "page" : undefined}
          className={segmentClassName(r.ansicht === aktiv)}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
