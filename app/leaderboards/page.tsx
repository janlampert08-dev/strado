import Link from "next/link";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import Header from "@/components/Header";
import PullToRefreshArea from "@/components/PullToRefreshArea";
import TrackLeaderboardChooser from "@/components/TrackLeaderboardChooser";
import Avatar from "@/components/Avatar";
import { getGlobalLeaderboards, type LeaderboardEntry } from "@/lib/leaderboard";
import { listRouteChoices } from "@/lib/routes";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import MotorklassenChips, { chipClassName } from "@/components/MotorklassenChips";
import {
  MOTORKLASSEN,
  istMotorklasse,
  motorklasseFor,
  motorklassendefinition,
} from "@/lib/motorklassen";
import type { Motorklasse, Vehicle } from "@/types/database";
import { MEDAL_COLORS } from "@/lib/constants";
import Card from "@/components/ui/Card";

export const metadata: Metadata = { title: "Bestenlisten – Strado" };

function LeaderboardSection({
  title,
  entries,
  unit,
  format = (v) => v.toLocaleString("de-CH"),
  currentUserId,
}: {
  title: string;
  entries: LeaderboardEntry[];
  unit: string;
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
                  className={`min-w-0 flex-1 truncate transition-colors duration-fast hover:text-accent ${
                    isOwn ? "font-medium text-accent" : ""
                  }`}
                >
                  {entry.name}
                </Link>
                <span
                  className={`shrink-0 font-mono tabular-nums ${isOwn ? "text-accent" : "text-muted"}`}
                >
                  {format(entry.value)} {unit}
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

function klassenHref(klasse: Motorklasse | null): string {
  return klasse ? `/leaderboards?klasse=${klasse}` : "/leaderboards";
}

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ klasse?: string }>;
}) {
  // Strikte Allowlist wie am öffentlichen Endpunkt: ein unbekannter Wert
  // führt zur Gesamtwertung, nicht zu einer leeren Seite oder einem Fehler.
  const { klasse: klasseRoh } = await searchParams;
  const klasse = istMotorklasse(klasseRoh) ? klasseRoh : null;

  const user = await getCurrentUser();
  const supabase = await createClient();

  const [
    { meisteFahrten, meisteHoehenmeter, meisteKm, meisteStrecken },
    routes,
    eigeneFahrzeuge,
  ] = await Promise.all([
    getGlobalLeaderboards(klasse),
    listRouteChoices(),
    user
      ? supabase
          .from("vehicles")
          .select("*")
          .eq("user_id", user.id)
          .then((r) => (r.data as Vehicle[]) ?? [])
      : Promise.resolve([] as Vehicle[]),
  ]);
  const currentUserId = user?.id ?? null;

  // "Meine Klasse" nur, wenn sie eindeutig ist: Wer ein Auto UND ein Motorrad
  // fährt, hat keine eine Klasse, und eine willkürlich gewählte wäre
  // schlechter als gar keine Abkürzung. Die sechs Chips stehen daneben.
  const eigeneKlassen = new Set(
    eigeneFahrzeuge.map((f) => motorklasseFor(f)).filter((k): k is Motorklasse => k !== null),
  );
  const meineKlasse = eigeneKlassen.size === 1 ? [...eigeneKlassen][0] : null;
  const klassenZusatz = klasse ? ` · ${motorklassendefinition(klasse).label}` : "";

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      {/* Ziehen zum Aktualisieren (nur Touch) — siehe PullToRefreshArea.tsx */}
      <PullToRefreshArea>
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10 lg:max-w-5xl">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-display font-semibold">Bestenlisten</h1>
            <p className="mt-1 text-sm text-muted">
              Nach Distanz, Höhenmetern, Anzahl aufgezeichneter Fahrten und Anzahl
              unterschiedlicher Strecken. Streckenbestzeiten unten zeigen nur Fahrten, die
              freiwillig dafür geteilt wurden.
            </p>
          </div>
          <MotorklassenChips
            klassen={ALLE_KLASSEN}
            aktiv={klasse}
            hrefFor={klassenHref}
            label="Bestenlisten nach Motorklasse filtern"
            vorne={
              meineKlasse && meineKlasse !== klasse ? (
                <Link
                  href={klassenHref(meineKlasse)}
                  scroll={false}
                  className={chipClassName(false)}
                >
                  Meine Klasse
                </Link>
              ) : null
            }
          />
          {klasse && (
            <p className="text-sm text-muted">
              Gewertet wird die Klasse, in der eine Fahrt gefahren wurde —{" "}
              <span className="font-medium text-foreground">
                {motorklassendefinition(klasse).label}
              </span>{" "}
              heisst {motorklassendefinition(klasse).regel}. Fahrten ohne Leistungsangabe am
              Fahrzeug zählen weiterhin in der Gesamtwertung mit.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-8 sm:grid sm:grid-cols-2 sm:items-start sm:gap-6 xl:grid-cols-4">
          <LeaderboardSection
            title={`Meiste Fahrten${klassenZusatz}`}
            entries={meisteFahrten}
            unit="Fahrten"
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
            unit="Strecken"
            currentUserId={currentUserId}
          />
        </div>

        <TrackLeaderboardChooser routes={routes} />
        </main>
      </div>
      </PullToRefreshArea>
    </div>
  );
}
