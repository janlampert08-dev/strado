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
  erstelltAm: string;
  /** Seit dem letzten Besuch dazugekommen — siehe 0100 bzw. 0057. */
  neu: boolean;
}

export interface KudosEintrag extends AktivitaetBasis {
  art: "kudos";
  completionId: string;
}

export interface FollowerEintrag extends AktivitaetBasis {
  art: "follower";
}

/**
 * Ein Pass, dem man folgt, hat auf- oder zugemacht (0104).
 *
 * Die dritte Art auf derselben Zeitachse, und die erste ohne Person: hier
 * reagiert niemand auf einen, hier ändert sich etwas an der Strasse. Deshalb
 * trägt sie die Personenfelder nicht als null mit, sondern gar nicht — eine
 * Zeile, die einen Avatar von null zeichnet, ist eine Zeile mit einem Loch.
 */
export interface PassEintrag {
  art: "pass";
  erstelltAm: string;
  neu: boolean;
  passId: string;
  passName: string;
  zustand: "offen" | "eingeschraenkt" | "gesperrt" | "wintersperre";
  vorher: "offen" | "eingeschraenkt" | "gesperrt" | "wintersperre" | null;
}

export type AktivitaetsEintrag = KudosEintrag | FollowerEintrag | PassEintrag;

/** Was eine Passmeldung auf der Zeitachse sagt. */
export function passMeldungText(eintrag: PassEintrag): string {
  if (eintrag.zustand === "offen") return "ist wieder offen";
  if (eintrag.zustand === "wintersperre") return "ist über den Winter zu";
  if (eintrag.zustand === "gesperrt") return "ist gesperrt";
  return "ist nur eingeschränkt befahrbar";
}

// Eine Zeile pro Reaktion, nicht pro Person: derselbe Nutzer kann mehreren
// Fahrten Kudos geben und zusätzlich folgen. Der Schlüssel muss deshalb die
// Art mitführen — ohne sie kollidiert das Kudo von A auf Fahrt X mit
// nichts, das Folgen von A aber mit einem späteren Wieder-Folgen von A.
export function aktivitaetsSchluessel(eintrag: AktivitaetsEintrag): string {
  if (eintrag.art === "kudos") return `kudos-${eintrag.completionId}-${eintrag.personId}`;
  if (eintrag.art === "pass") return `pass-${eintrag.passId}-${eintrag.erstelltAm}`;
  return `follower-${eintrag.personId}-${eintrag.erstelltAm}`;
}

export const AKTIVITAET_LIMIT = 30;

// Reine Funktion, damit sie ohne Datenbank testbar ist (lib/aktivitaet.test.ts)
// — im Sinne von AGENTS.md, "There are no component or E2E tests": was in
// lib/ steht, ist das Einzige, was hier automatisiert abgedeckt werden kann.
//
// Das Kappen auf AKTIVITAET_LIMIT nach dem Mischen ist korrekt, nicht nur
// pragmatisch: beide Quellen liefern bereits die jeweils letzten 30 (0057
// bzw. 0100). Die gemeinsamen letzten 30 können aus einer Quelle höchstens
// 30 Einträge enthalten — es kann also kein Eintrag fehlen, der es in die
// gemischte Liste geschafft hätte.
//
// eigeneId: die eigene Reaktion ist keine Neuigkeit. recent_kudos_received
// (0057) filtert nur auf die Fahrt des Aufrufers, nicht auf den Gebenden —
// wer seiner eigenen Fahrt Kudos gab, las danach "Jan hat deiner Fahrt
// Kudos gegeben" über sich selbst. Gefiltert wird hier und nicht in der
// Datenbank, weil das eine Frage der Anzeige ist und keine neue Migration
// rechtfertigt; gefiltert wird VOR dem Kappen, damit die eigene Zeile keinen
// der 30 Plätze belegt.
export function mischeAktivitaet(
  kudos: ReceivedKudos[],
  follower: ReceivedFollower[],
  passMeldungen: PassEintrag[] = [],
  eigeneId: string | null = null,
): AktivitaetsEintrag[] {
  const eintraege: AktivitaetsEintrag[] = [
    ...kudos.filter((k) => eigeneId === null || k.giverId !== eigeneId).map(
      (k): KudosEintrag => ({
        art: "kudos",
        completionId: k.completionId,
        personId: k.giverId,
        personName: k.giverDisplayName,
        personAvatarUrl: k.giverAvatarUrl,
        erstelltAm: k.erstelltAm,
        neu: k.neu,
      }),
    ),
    ...follower.filter((f) => eigeneId === null || f.followerId !== eigeneId).map(
      (f): FollowerEintrag => ({
        art: "follower",
        personId: f.followerId,
        personName: f.followerDisplayName,
        personAvatarUrl: f.followerAvatarUrl,
        erstelltAm: f.erstelltAm,
        neu: f.neu,
      }),
    ),
    ...passMeldungen,
  ];

  // Neueste zuerst. Gleicher Zeitstempel (zwei Reaktionen in derselben
  // Millisekunde) ist möglich, aber ohne fachliche Rangfolge — die
  // Reihenfolge bleibt dann die der Eingabe, weil Array.sort seit ES2019
  // stabil ist.
  eintraege.sort((a, b) => Date.parse(b.erstelltAm) - Date.parse(a.erstelltAm));

  return eintraege.slice(0, AKTIVITAET_LIMIT);
}
