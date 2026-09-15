import type { ReceivedKudos } from "@/lib/kudos";
import type { ReceivedFollower } from "@/lib/follows";

// Der Rückkanal aus Schritt 8 des Kernloops (AGENTS.md, "Core User Loop"),
// an einer Stelle zusammengefasst: /aktivitaet zeigt beides nebeneinander,
// die Kopfleiste zählt beides in einem Abzeichen.
//
// Zwei Arten, eine Zeitachse. Die gemischte Liste ist der Grund für diese
// Datei: ohne sie müsste die Seite zwei Reihenfolgen nebeneinanderlegen und
// der Nutzer beim Lesen selbst mischen.
//
// Diese Datei enthält BEWUSST keine Abfrage und importiert nichts aus
// lib/supabase/server — sie wird von components/ActivityList.tsx ("use
// client") mitgenutzt. Ein Wertimport aus einem Modul, das den Server-Client
// zieht, bricht den Build an der Server/Client-Grenze (AGENTS.md, Regel 13);
// nur ein reiner Typ-Import wird wegkompiliert. Die Abfragen stehen deshalb
// in lib/aktivitaetsliste.ts.

interface AktivitaetBasis {
  personId: string;
  personName: string | null;
  personAvatarUrl: string | null;
  /** Abzeichen hinter dem Namen (0087). */
  personZeigtPremiumAbzeichen: boolean;
  erstelltAm: string;
  /** Seit dem letzten Besuch dazugekommen — siehe 0097 bzw. 0057. */
  neu: boolean;
}

export interface KudosEintrag extends AktivitaetBasis {
  art: "kudos";
  completionId: string;
}

export interface FollowerEintrag extends AktivitaetBasis {
  art: "follower";
}

export type AktivitaetsEintrag = KudosEintrag | FollowerEintrag;

// Eine Zeile pro Reaktion, nicht pro Person: derselbe Nutzer kann mehreren
// Fahrten Kudos geben und zusätzlich folgen. Der Schlüssel muss deshalb die
// Art mitführen — ohne sie kollidiert das Kudo von A auf Fahrt X mit
// nichts, das Folgen von A aber mit einem späteren Wieder-Folgen von A.
export function aktivitaetsSchluessel(eintrag: AktivitaetsEintrag): string {
  return eintrag.art === "kudos"
    ? `kudos-${eintrag.completionId}-${eintrag.personId}`
    : `follower-${eintrag.personId}-${eintrag.erstelltAm}`;
}

export const AKTIVITAET_LIMIT = 30;

// Reine Funktion, damit sie ohne Datenbank testbar ist (lib/aktivitaet.test.ts)
// — im Sinne von AGENTS.md, "There are no component or E2E tests": was in
// lib/ steht, ist das Einzige, was hier automatisiert abgedeckt werden kann.
//
// Das Kappen auf AKTIVITAET_LIMIT nach dem Mischen ist korrekt, nicht nur
// pragmatisch: beide Quellen liefern bereits die jeweils letzten 30 (0057
// bzw. 0097). Die gemeinsamen letzten 30 können aus einer Quelle höchstens
// 30 Einträge enthalten — es kann also kein Eintrag fehlen, der es in die
// gemischte Liste geschafft hätte.
export function mischeAktivitaet(
  kudos: ReceivedKudos[],
  follower: ReceivedFollower[],
): AktivitaetsEintrag[] {
  const eintraege: AktivitaetsEintrag[] = [
    ...kudos.map(
      (k): KudosEintrag => ({
        art: "kudos",
        completionId: k.completionId,
        personId: k.giverId,
        personName: k.giverDisplayName,
        personAvatarUrl: k.giverAvatarUrl,
        personZeigtPremiumAbzeichen: k.giverZeigtPremiumAbzeichen,
        erstelltAm: k.erstelltAm,
        neu: k.neu,
      }),
    ),
    ...follower.map(
      (f): FollowerEintrag => ({
        art: "follower",
        personId: f.followerId,
        personName: f.followerDisplayName,
        personAvatarUrl: f.followerAvatarUrl,
        personZeigtPremiumAbzeichen: f.followerZeigtPremiumAbzeichen,
        erstelltAm: f.erstelltAm,
        neu: f.neu,
      }),
    ),
  ];

  // Neueste zuerst. Gleicher Zeitstempel (zwei Reaktionen in derselben
  // Millisekunde) ist möglich, aber ohne fachliche Rangfolge — die
  // Reihenfolge bleibt dann die der Eingabe, weil Array.sort seit ES2019
  // stabil ist.
  eintraege.sort((a, b) => Date.parse(b.erstelltAm) - Date.parse(a.erstelltAm));

  return eintraege.slice(0, AKTIVITAET_LIMIT);
}
