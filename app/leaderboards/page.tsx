import Link from "next/link";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import Header from "@/components/Header";
import TrackLeaderboardChooser from "@/components/TrackLeaderboardChooser";
import Avatar from "@/components/Avatar";
import { getGlobalLeaderboards, type LeaderboardEntry } from "@/lib/leaderboard";
import { listRouteChoices } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
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

export default async function LeaderboardsPage() {
  const supabase = await createClient();
  const [
    { meisteFahrten, meisteHoehenmeter, meisteKm, meisteStrecken },
    routes,
    {
      data: { user },
    },
  ] = await Promise.all([getGlobalLeaderboards(), listRouteChoices(), supabase.auth.getUser()]);
  const currentUserId = user?.id ?? null;

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10 lg:max-w-5xl">
        <div>
          <h1 className="text-display font-semibold">Bestenlisten</h1>
          <p className="mt-1 text-sm text-muted">
            Nach Distanz, Höhenmetern, Anzahl aufgezeichneter Fahrten und Anzahl unterschiedlicher
            Strecken. Streckenbestzeiten unten zeigen nur Fahrten, die freiwillig dafür geteilt
            wurden.
          </p>
        </div>

        <div className="flex flex-col gap-8 sm:grid sm:grid-cols-2 sm:items-start sm:gap-6 xl:grid-cols-4">
          <LeaderboardSection
            title="Meiste Fahrten"
            entries={meisteFahrten}
            unit="Fahrten"
            currentUserId={currentUserId}
          />
          <LeaderboardSection
            title="Meiste Höhenmeter"
            entries={meisteHoehenmeter}
            unit="m"
            format={(v) => Math.round(v).toLocaleString("de-CH")}
            currentUserId={currentUserId}
          />
          <LeaderboardSection
            title="Meiste km gefahren"
            entries={meisteKm}
            unit="km"
            format={(v) => v.toFixed(0)}
            currentUserId={currentUserId}
          />
          <LeaderboardSection
            title="Entdecker"
            entries={meisteStrecken}
            unit="Strecken"
            currentUserId={currentUserId}
          />
        </div>

        <TrackLeaderboardChooser routes={routes} />
        </main>
      </div>
    </div>
  );
}
