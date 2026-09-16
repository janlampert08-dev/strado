import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import Header from "@/components/Header";
import PullToRefreshArea from "@/components/PullToRefreshArea";
import TrackLeaderboardChooser from "@/components/TrackLeaderboardChooser";
import Avatar from "@/components/Avatar";
import { getGlobalLeaderboards, type LeaderboardEntry } from "@/lib/leaderboard";
import { listRouteChoices } from "@/lib/routes";
import { nomen } from "@/lib/format";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import MotorklassenChips from "@/components/MotorklassenChips";
// chipClassName kommt bewusst NICHT aus MotorklassenChips: das ist eine
// "use client"-Datei, und diese Seite ist eine Server Component. Ein
// Nicht-Komponenten-Export von dort wäre hier kein Wert, sondern ein
// Client-Verweis, der beim Aufruf wirft. Siehe motorklassenChipStil.ts.
import { chipClassName } from "@/components/motorklassenChipStil";
import {
  FAHRZEUGTYPEN,
  MOTORKLASSEN,
  filterLabel,
  istKlassenfilter,
  motorklasseFor,
} from "@/lib/motorklassen";
import type { Klassenfilter } from "@/lib/motorklassen";
import type { Motorklasse, Vehicle } from "@/types/database";
import { MEDAL_COLORS } from "@/lib/constants";
import Card from "@/components/ui/Card";
import LeaderboardListsSkeleton from "@/components/LeaderboardListsSkeleton";

export const metadata: Metadata = {
  title: "Bestenlisten – Strado",
  description:
    "Die schnellsten Zeiten je Strecke und Fahrzeugklasse — und die Fahrerinnen und Fahrer mit den meisten Kilometern in der Schweiz.",
  // Kanonische Adresse. Die App wird unter mehr als einem Hostnamen
  // ausgeliefert — app.strado.ch, die Vorschau-Adressen jedes Deployments,
  // dazu Staging — und lieferte bis hierher auf keiner davon ein Canonical
  // aus (im ausgelieferten HTML nachgesehen). Damit steht derselbe Inhalt
  // mehrfach zur Auswahl, und welche Adresse eine Suchmaschine nimmt, ist
  // ihre Entscheidung statt unsere.
  //
  // Der relative Pfad wird von Next gegen metadataBase aufgelöst
  // (app/layout.tsx). Bewusst ohne Query: alternates.canonical gehört an die
  // Adresse OHNE ?-Parameter, sonst zählt jeder Filter- und Marker-Wert als
  // eigene Seite.
  //
  // Hier besonders wichtig: die Seite nimmt ?typ= und ?klasse= entgegen. Ohne
  // Canonical wäre jede Kombination eine eigene Adresse mit weitgehend
  // demselben Inhalt.
  alternates: { canonical: "/leaderboards" },
};

function LeaderboardSection({
  title,
  entries,
  unit,
  format = (v) => v.toLocaleString("de-CH"),
  currentUserId,
}: {
  title: string;
  entries: LeaderboardEntry[];
  // Entweder eine feste Einheit ("km", "m") oder eine, die sich nach dem Wert
  // richtet — "1 Fahrt" statt "1 Fahrten". Die Einheit hängt hier am
  // einzelnen Eintrag, nicht an der Liste: Platz 1 kann 8 Fahrten haben und
  // Platz 2 genau eine.
  unit: string | ((wert: number) => string);
  format?: (value: number) => string;
  currentUserId: string | null;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Einträge.</p>
      ) : (
        <Card as="ol" className="divide-y divide-border">
          {entries.map((entry, i) => {
            const isOwn = entry.userId === currentUserId;
            return (
              <li
                key={entry.userId}
                className={`flex items-center gap-2 px-4 py-3 text-sm ${
                  isOwn ? "bg-accent/5" : ""
                }`}
              >
                {i < 3 ? (
                  <span className="flex w-4 shrink-0 justify-center">
                    <Trophy className="h-4 w-4" style={{ color: MEDAL_COLORS[i] }} aria-hidden="true" />
                    <span className="sr-only">Platz {i + 1}</span>
                  </span>
                ) : (
                  <span className="w-4 shrink-0 text-center font-mono text-xs text-muted">{i + 1}.</span>
                )}
                <Avatar url={entry.avatarUrl} name={entry.name} size={24} />
                <Link
                  href={`/fahrer/${entry.userId}`}
                  className={`flex min-w-0 flex-1 items-center transition-colors duration-fast hover:text-accent ${
                    isOwn ? "font-medium text-accent" : ""
                  }`}
                >
                  <span className="truncate">{entry.name}</span>
                </Link>
                <span
                  className={`shrink-0 font-mono tabular-nums ${isOwn ? "text-accent" : "text-muted"}`}
                >
                  {format(entry.value)} {typeof unit === "function" ? unit(entry.value) : unit}
                </span>
              </li>
            );
          })}
        </Card>
      )}
    </section>
  );
}

// Alle sechs Klassen sind hier immer sichtbar — anders als auf der
// Streckenseite, wo nur belegte Klassen erscheinen. Global ist eine leere
// Klassenliste eine Einladung ("sei die erste"), keine Lücke.
const ALLE_KLASSEN: Motorklasse[] = MOTORKLASSEN.map((k) => k.id);

// Beide Stufen der Auswahl: die zwei Fahrzeugtypen und die sechs Klassen.
const ALLE_FILTER: Klassenfilter[] = [...FAHRZEUGTYPEN.map((t) => t.id), ...ALLE_KLASSEN];

function klassenHref(filter: Klassenfilter | null): string {
  return filter ? `/leaderboards?klasse=${filter}` : "/leaderboards";
}

// Die Ziele aller Chips einmal vorberechnen. MotorklassenChips ist
// "use client", diese Seite eine Server Component — eine Funktion darf diese
// Grenze nicht überqueren, eine Zuordnung aus Zeichenketten schon. Die Form
// der Adresse bleibt damit hier, wo auch die Gegenprüfung des Parameters
// steht (istKlassenfilter unten).
//
// Die Schlüssel sind Fahrzeugtyp- und Klassen-IDs aus lib/motorklassen.ts —
// einem Modul ohne "use client", die Werte sind hier also echte Strings.
// "Alle" geht daneben als eigenes Feld an die Leiste und braucht gar keinen
// Schlüssel.
const KLASSEN_HREFS: Partial<Record<Klassenfilter, string>> = Object.fromEntries(
  ALLE_FILTER.map((f) => [f, klassenHref(f)]),
);


// Ab hier drei Bausteine, die jeweils ihre eigenen Daten holen. Der Grund
// ist die Bedienung, nicht die Ordnung: Solange die Seite selbst auf
// Sitzung, Fahrzeuge, Ranglisten und Streckenliste wartete, konnte sie erst
// rendern, wenn alle vier da waren — und bei jedem Klick auf einen
// Klassen-Chip ersetzte app/leaderboards/loading.tsx die *ganze* Seite
// samt Chip-Leiste durch ein Skelett. Ein Filterklick fühlte sich damit an
// wie ein Seitenneuaufbau.
//
// Jetzt hängt die Hülle (Überschrift und Chips) nur noch am
// URL-Parameter. Sie steht sofort, die Chip-Leiste bleibt stehen, und nur
// die Listen darunter tauschen sich hinter ihrer eigenen Grenze aus.
// Genau das empfiehlt die Next-Doku zu useLinkStatus: die Ursache mit einer
// Ladegrenze beheben, statt am Link herumzudoktern.
//
// getCurrentUser() ist in React cache() gewickelt (lib/supabase/server.ts),
// die mehrfachen Aufrufe kosten deshalb keinen zusätzlichen Roundtrip.

// Der Abkürzungs-Chip ganz vorn. Eigene Grenze, weil er als Einziges die
// Fahrzeuge des Nutzers braucht — ohne sie wartete die ganze Leiste darauf.
async function MeineKlasseChip({ aktiv }: { aktiv: Klassenfilter | null }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select("*").eq("user_id", user.id);

  // "Meine Klasse" nur, wenn sie eindeutig ist: Wer ein Auto UND ein
  // Motorrad fährt, hat keine eine Klasse, und eine willkürlich gewählte
  // wäre schlechter als gar keine Abkürzung. Die sechs Chips stehen daneben.
  const eigeneKlassen = new Set(
    ((data as Vehicle[]) ?? [])
      .map((f) => motorklasseFor(f))
      .filter((k): k is Motorklasse => k !== null),
  );
  const meineKlasse = eigeneKlassen.size === 1 ? [...eigeneKlassen][0] : null;
  if (!meineKlasse || meineKlasse === aktiv) return null;

  return (
    <Link href={klassenHref(meineKlasse)} scroll={false} className={chipClassName(false)}>
      Meine Klasse
    </Link>
  );
}

// Die vier Volumenlisten. Der key an der Suspense-Grenze in der Seite sorgt
// dafür, dass React den alten Teilbaum beim Klassenwechsel verwirft und das
// Skelett zeigt, statt die alten Zahlen stehen zu lassen.
async function Ranglisten({ klasse }: { klasse: Klassenfilter | null }) {
  const [{ meisteFahrten, meisteHoehenmeter, meisteKm, meisteStrecken }, user] =
    await Promise.all([getGlobalLeaderboards(klasse), getCurrentUser()]);

  const currentUserId = user?.id ?? null;
  const klassenZusatz = klasse ? ` · ${filterLabel(klasse)}` : "";

  return (
    <div className="flex flex-col gap-8 sm:grid sm:grid-cols-2 sm:items-start sm:gap-6 xl:grid-cols-4">
      <LeaderboardSection
        title={`Meiste Fahrten${klassenZusatz}`}
        entries={meisteFahrten}
        unit={(n) => nomen(n, "Fahrt", "Fahrten")}
        currentUserId={currentUserId}
      />
      <LeaderboardSection
        title={`Meiste Höhenmeter${klassenZusatz}`}
        entries={meisteHoehenmeter}
        unit="m"
        format={(v) => Math.round(v).toLocaleString("de-CH")}
        currentUserId={currentUserId}
      />
      <LeaderboardSection
        title={`Meiste km gefahren${klassenZusatz}`}
        entries={meisteKm}
        unit="km"
        format={(v) => v.toFixed(0)}
        currentUserId={currentUserId}
      />
      <LeaderboardSection
        title={`Entdecker${klassenZusatz}`}
        entries={meisteStrecken}
        unit={(n) => nomen(n, "Strecke", "Strecken")}
        currentUserId={currentUserId}
      />
    </div>
  );
}

// Die Streckenbestzeiten unten. Eigene Grenze, damit die Streckenliste den
// oberen Teil der Seite nicht aufhält; sie hängt nicht an der Klasse.
async function Streckenwahl() {
  const routes = await listRouteChoices();
  return <TrackLeaderboardChooser routes={routes} />;
}

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ klasse?: string }>;
}) {
  // Strikte Allowlist wie am öffentlichen Endpunkt: ein unbekannter Wert
  // führt zur Gesamtwertung, nicht zu einer leeren Seite oder einem Fehler.
  //
  // Das ist das Einzige, worauf diese Funktion noch wartet. Alles Weitere
  // holen die Bausteine oben hinter ihren eigenen Ladegrenzen.
  const { klasse: klasseRoh } = await searchParams;
  const klasse = istKlassenfilter(klasseRoh) ? klasseRoh : null;

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      {/* Ziehen zum Aktualisieren (nur Touch) — siehe PullToRefreshArea.tsx */}
      <PullToRefreshArea>
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10 lg:max-w-5xl">
        <div className="flex flex-col gap-3">
          <h1 className="text-display font-semibold">Bestenlisten</h1>
          <MotorklassenChips
            klassen={ALLE_KLASSEN}
            aktiv={klasse}
            hrefAlle={klassenHref(null)}
            hrefs={KLASSEN_HREFS}
            label="Bestenlisten nach Motorklasse filtern"
            vorne={
              <Suspense fallback={null}>
                <MeineKlasseChip aktiv={klasse} />
              </Suspense>
            }
          />
        </div>

        {/* key: beim Klassenwechsel verwirft React den alten Teilbaum und
            zeigt das Skelett, statt die Zahlen der vorigen Klasse stehen zu
            lassen, bis die neuen da sind. */}
        <Suspense key={klasse ?? "alle"} fallback={<LeaderboardListsSkeleton />}>
          <Ranglisten klasse={klasse} />
        </Suspense>

        <Suspense fallback={null}>
          <Streckenwahl />
        </Suspense>
        </main>
      </div>
      </PullToRefreshArea>
    </div>
  );
}
