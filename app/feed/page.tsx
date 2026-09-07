import Link from "next/link";
import { Rss } from "lucide-react";
import Header from "@/components/Header";
import Avatar from "@/components/Avatar";
import KudosButton from "@/components/KudosButton";
import ProfileSearch from "@/components/ProfileSearch";
import { getFeed, type FeedScope } from "@/lib/feed";
import { freieFahrtTitel } from "@/lib/completions";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export const metadata = {
  title: "Feed – Cornice",
};

// Öffentlich lesbar wie /strecken/[id] (public_fahrten ist an anon
// freigegeben) — nur der "Folge ich"-Filter und der Kudos-Button brauchen
// eine Session. Kein Redirect zu /anmelden, damit ein geteilter Feed-Link
// auch für ausgeloggte Besucher funktioniert.
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: scopeParam } = await searchParams;
  const scope: FeedScope = scopeParam === "following" ? "following" : "global";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const feed = await getFeed(scope, user?.id ?? null);

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8 sm:px-6 sm:py-10">
        <div>
          <h1 className="text-display font-semibold">Feed</h1>
          <p className="mt-1 text-sm text-muted">Geteilte Fahrten aus der Community.</p>
        </div>

        <ProfileSearch />

        {user && (
          <div className="flex gap-2 border-b border-border pb-3">
            <Link
              href="/feed"
              // Der aktive Filter war ausschliesslich an der Hintergrundfarbe
              // erkennbar. BottomNav.tsx macht es im selben Repo richtig.
              aria-current={scope === "global" ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-fast",
                scope === "global" ? "bg-foreground text-background" : "text-muted hover:text-foreground",
              )}
            >
              Alle
            </Link>
            <Link
              href="/feed?scope=following"
              aria-current={scope === "following" ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-fast",
                scope === "following" ? "bg-foreground text-background" : "text-muted hover:text-foreground",
              )}
            >
              Folge ich
            </Link>
          </div>
        )}

        {feed.length === 0 ? (
          <EmptyState
            icon={Rss}
            title={
              scope === "following"
                ? "Noch keine Fahrten von Fahrern, denen du folgst."
                : "Noch keine geteilten Fahrten."
            }
            action={
              scope === "following" ? (
                <Link href="/feed" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Alle Fahrten ansehen
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {feed.map((item) => (
              <Card as="li" key={item.completion_id} className="overflow-hidden">
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Link href={`/fahrer/${item.user_id}`} className="shrink-0">
                      <Avatar url={item.avatar_url} name={item.display_name} size={40} />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/fahrer/${item.user_id}`}
                        className="block truncate text-sm font-medium transition-colors duration-fast hover:text-accent"
                      >
                        {item.display_name ?? "Fahrer"}
                      </Link>
                      <p className="text-xs text-muted">{new Date(item.datum).toLocaleDateString("de-CH")}</p>
                    </div>
                  </div>

                  <Link
                    href={`/fahrten/${item.completion_id}`}
                    className="flex items-baseline justify-between gap-2 transition-colors duration-fast hover:text-accent"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {item.art === "frei"
                        ? freieFahrtTitel(item.titel, item.start_ort)
                        : item.route_name}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                      {(item.distanz_km ?? item.laenge_km ?? 0).toFixed(1)} km
                    </span>
                  </Link>
                  {/* Freie Fahrten sind als solche gekennzeichnet: sie
                      führen über keine geprüfte Strecke, und der Unterschied
                      soll in der Liste sichtbar sein statt nur im Titel
                      mitschwingen. */}
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    {item.art === "frei" && (
                      <span className="rounded-full border border-border px-1.5 py-0.5">
                        Freie Fahrt
                      </span>
                    )}
                    {item.region}
                  </p>

                  {user && (
                    <div className="flex justify-end">
                      <KudosButton
                        completionId={item.completion_id}
                        initialCount={item.kudos.count}
                        initialGiven={item.kudos.givenByMe}
                      />
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </ul>
        )}
        </main>
      </div>
    </div>
  );
}
