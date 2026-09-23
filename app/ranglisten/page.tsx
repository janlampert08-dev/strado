import { Suspense, type ComponentType } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Compass, Route, Ruler, TrendingUp } from "lucide-react";
import Header from "@/components/Header";
import { RankingIcon } from "@/components/NavIcons";
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
  filterImSatz,
  filterLabel,
  istKlassenfilter,
  motorklasseFor,
} from "@/lib/motorklassen";
import type { Klassenfilter } from "@/lib/motorklassen";
import type { Motorklasse, Vehicle } from "@/types/database";
import { MEDAL_COLORS } from "@/lib/constants";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import LeaderboardListsSkeleton from "@/components/LeaderboardListsSkeleton";
import AbschnittTabs from "@/components/ui/AbschnittTabs";
import SectionHeading from "@/components/ui/SectionHeading";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

// generateMetadata statt einer festen Konstante, allein wegen des Titels:
// /ranglisten und /ranglisten?klasse=motorrad zeigten dieselbe Zeile im Tab
// und im Verlauf, obwohl die zweite Adresse nur eine von fünf Listen führt.
// Wer zwei Filter nebeneinander offen hat, konnte die Reiter nicht
// auseinanderhalten.
//
// Alles Übrige — Beschreibung und vor allem das Canonical — bleibt
// unverändert: der Filter darf im Titel stehen und trotzdem keine eigene
// Seite für Suchmaschinen sein.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ klasse?: string }>;
}): Promise<Metadata> {
  const { klasse } = await searchParams;
  const zusatz = istKlassenfilter(klasse) ? ` – ${filterLabel(klasse)}` : "";
  return { ...basisMetadaten, title: `Ranglisten${zusatz} – Strado` };
}

const basisMetadaten: Metadata = {
  title: "Ranglisten – Strado",
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
  alternates: { canonical: "/ranglisten" },
};

function LeaderboardSection({
  title,
  icon,
  entries,
  unit,
  format = (v) => v.toLocaleString("de-CH"),
  currentUserId,
  beschreibung,
}: {
  title: string;
  /** Ein Satz, was gezählt wird — nur wo der Titel es nicht selbst sagt. */
  beschreibung?: string;
  /** Jede Abschnittsmarke trägt eines — siehe components/ui/SectionHeading.tsx. */
  icon: ComponentType<{ className?: string }>;
  entries: LeaderboardEntry[];
  // Entweder eine feste Einheit ("km", "m") oder eine, die sich nach dem Wert
  // richtet — "1 Fahrt" statt "1 Fahrten". Die Einheit hängt hier am
  // einzelnen Eintrag, nicht an der Liste: Platz 1 kann 8 Fahrten haben und
  // Platz 2 genau eine.
  unit: string | ((wert: number) => string);
  format?: (value: number) => string;
  currentUserId: string | null;
}) {
  // Einträge mit dem Wert 0 sind keine Platzierung. "Entdecker · Platz 1 ·
  // Jan · 0 Strecken" las sich wie eine kaputte Liste: Platz 1 für nichts.
  // Wer noch nichts hat, steht nicht auf dem Podest, sondern fehlt — und
  // bleiben nur solche übrig, greift der ehrliche Leerzustand darunter.
  const platzierte = entries.filter((entry) => entry.value > 0);
  return (
    <section className="flex flex-col gap-3">
      {/* min-h an der Beschreibung: die vier Spalten stehen ab sm
          nebeneinander, und eine zweizeilige Beschreibung schob ihre Liste
          eine Zeile tiefer als die Nachbarn — vier Siegerzeilen auf drei
          Grundlinien. */}
      <div className="flex flex-col gap-0.5">
        <SectionHeading icon={icon}>{title}</SectionHeading>
        {beschreibung && <p className="text-xs text-muted sm:min-h-8">{beschreibung}</p>}
      </div>
      {platzierte.length === 0 ? (
        // Dieselbe Fläche wie eine gefüllte Liste: eine nackte Textzeile
        // neben drei gerahmten Karten las sich wie ein Darstellungsfehler.
        <Card className="px-4 py-3 text-sm text-muted">Noch keine Einträge.</Card>
      ) : (
        <Card as="ol" className="divide-y divide-border">
          {platzierte.map((entry, i) => {
            const isOwn = entry.userId === currentUserId;
            return (
              <li
                key={entry.userId}
                className={`druckbar flex items-center gap-2 px-4 py-3 text-sm ${
                  isOwn ? "bg-accent/5" : ""
                }`}
              >
                {i < 3 ? (
                  <span className="flex w-4 shrink-0 justify-center">
                    <RankingIcon className="h-4 w-4" style={{ color: MEDAL_COLORS[i] }} aria-hidden="true" />
                    <span className="sr-only">Platz {i + 1}</span>
                  </span>
                ) : (
                  <span className="w-4 shrink-0 text-center text-xs text-muted">{i + 1}.</span>
                )}
                <Avatar url={entry.avatarUrl} name={entry.name} size={24} />
                <Link
                  href={`/fahrer/${entry.userId}`}
                  // after: dehnt die Tippfläche über die ganze Zeilenhöhe
                  // (py-3 der Zeile), die Schrift allein war 20 px hoch.
                  className={`relative flex min-w-0 flex-1 items-center transition-colors duration-fast hover:text-accent after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] ${
                    isOwn ? "font-medium text-accent" : ""
                  }`}
                >
                  <span className="truncate">{entry.name}</span>
                </Link>
                <span
                  className={`shrink-0 tabular-nums ${isOwn ? "text-accent" : "text-muted"}`}
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
  return filter ? `/ranglisten?klasse=${filter}` : "/ranglisten";
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
// Klassen-Chip ersetzte app/ranglisten/loading.tsx die *ganze* Seite
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
  // Kein Klassen-Zusatz mehr in jedem Titel: die gewählte Klasse steht im
  // aktiven Chip direkt darüber, und "· Motorräder" viermal wiederholt liess
  // zwei der vier Titel auf dem Telefon umbrechen.
  const klassenZusatz = "";

  // Sind alle vier Listen leer, stand hier viermal "Noch keine Einträge."
  // unter vier Überschriften: ein Raster aus Absagen. Eine einzige Stelle
  // sagt dasselbe einmal und dazu, was es braucht, um draufzukommen.
  // Gezählt wird nur, wer einen Wert über null hat — ein Eintrag mit 0
  // ist keine Platzierung.
  const allesLeer = [meisteFahrten, meisteHoehenmeter, meisteKm, meisteStrecken].every(
    (liste) => !liste.some((eintrag) => eintrag.value > 0),
  );
  if (allesLeer) {
    return (
      <EmptyState
        icon={RankingIcon}
        title={klasse ? `Noch keine geteilte Fahrt ${filterImSatz(klasse)}.` : "Die Ranglisten sind noch leer."}
        // "geteilte": leaderboard_completions (0080) zählt nur Fahrten mit
        // ist_oeffentlich. Ohne das Wort versprach der Satz einer privaten
        // Fahrt einen Platz, den sie nie bekommt.
        description="Fahrten, Kilometer, Höhenmeter und Strecken zählen ab der ersten geteilten Fahrt. Schon eine kann für Platz 1 reichen."
        action={
          <Link href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
            Strecken entdecken
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Eine Rangliste führt, drei vertiefen: vier gleich grosse Podien
          hiessen kein Podium. Km ist die Schweizer Währung des Unterwegsseins.
          Die drei stehen offen dahinter, ohne eigene Klappe
          (Eigentümerentscheid): Wer bis hierher scrollt, will Ranglisten
          sehen. */}
      <LeaderboardSection
        title={`Meiste km gefahren${klassenZusatz}`}
        icon={Ruler}
        entries={meisteKm}
        unit="km"
        format={(v) => v.toFixed(0)}
        currentUserId={currentUserId}
      />
      <div className="flex flex-col gap-8 sm:grid sm:grid-cols-2 sm:items-start sm:gap-6 xl:grid-cols-3">
        <LeaderboardSection
          title={`Meiste Fahrten${klassenZusatz}`}
          icon={Route}
          entries={meisteFahrten}
          unit={(n) => nomen(n, "Fahrt", "Fahrten")}
          currentUserId={currentUserId}
        />
        <LeaderboardSection
          title={`Meiste Höhenmeter${klassenZusatz}`}
          icon={TrendingUp}
          entries={meisteHoehenmeter}
          unit="m"
          format={(v) => Math.round(v).toLocaleString("de-CH")}
          currentUserId={currentUserId}
        />
        <LeaderboardSection
          title={`Entdecker${klassenZusatz}`}
          icon={Compass}
          entries={meisteStrecken}
          unit={(n) => nomen(n, "Strecke", "Strecken")}
          currentUserId={currentUserId}
        />
      </div>
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
        <Seitenrahmen breite="weit">
        <div className="flex flex-col gap-3">
          {/* Keine Reiterleiste mehr: die Ranglisten sind ein eigener Bereich
              mit eigenem Eintrag in der Navigation (lib/nav.ts) statt eines
              Reiters auf /feed. Sie haben eigene Daten, einen eigenen Filter
              und einen eigenen Anlass — als dritter Reiter einer anderen
              Seite waren sie so auffindbar wie ein Menüeintrag, den man erst
              aufklappt. */}
          <div>
            <h1 className="text-display font-semibold">Ranglisten</h1>
            <p className="mt-1 text-sm text-muted">
              Wer am meisten unterwegs war — und die schnellsten Zeiten je Strecke.
            </p>
          </div>
          <MotorklassenChips
            klassen={ALLE_KLASSEN}
            aktiv={klasse}
            hrefAlle={klassenHref(null)}
            hrefs={KLASSEN_HREFS}
            label="Ranglisten nach Motorklasse filtern"
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
        {/* Zwei Ansichten statt einer Säule: Volumenlisten und
            Streckenbestzeiten hatten je ein eigenes Filtersystem auf
            derselben Seite. Jetzt Reiter — der Chooser lebt im zweiten. */}
        <AbschnittTabs tabs={[{ titel: "Ranglisten" }, { titel: "Bestzeiten" }]}>
          <div>
            <Suspense key={klasse ?? "alle"} fallback={<LeaderboardListsSkeleton />}>
              <Ranglisten klasse={klasse} />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={null}>
              <Streckenwahl />
            </Suspense>
          </div>
        </AbschnittTabs>
        </Seitenrahmen>
      </div>
      </PullToRefreshArea>
    </div>
  );
}
