import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Car } from "lucide-react";
import Header from "@/components/Header";
import Avatar from "@/components/Avatar";
import KudosButton from "@/components/KudosButton";
import FollowButton from "@/components/FollowButton";
import FollowCounts from "@/components/FollowCounts";
import FollowedBy from "@/components/FollowedBy";
import VehicleGrid from "@/components/VehicleGrid";
import { getPublicProfile } from "@/lib/profile";
import { getKudosForCompletions } from "@/lib/kudos";
import {
  isFollowing,
  getFollowCounts,
  getFollowerProfiles,
  getFollowingProfiles,
  getMutualFollowers,
} from "@/lib/follows";
import { getCurrentUser } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import { freieFahrtTitel } from "@/lib/completions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) return { title: "Fahrer – Cornice" };
  return { title: `${profile.displayName ?? "Fahrer"} – Cornice` };
}

export default async function FahrerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // getPublicProfile() und der Betrachter sind voneinander unabhängig (das
  // Profil selbst braucht ihn nicht) — parallel gestartet.
  // Follower-/Following-LISTEN (nicht die Zahlen) folgen erst danach, weil
  // ob sie überhaupt geladen werden von profile.zeigtFollowerListe abhängt.
  //
  // getCurrentUser() statt eines eigenen Clients mit auth.getUser(): der
  // Header rendert auf derselben Anfrage und holt denselben Nutzer aus dem
  // request-weiten Cache. Ein zweiter Supabase-Client wird hier sonst
  // nirgends gebraucht.
  const [profile, viewer, followCounts] = await Promise.all([
    getPublicProfile(id),
    getCurrentUser(),
    getFollowCounts(id),
  ]);

  if (!profile) notFound();

  // Die Zahlen bleiben immer sichtbar (0037_public_follows.sql) — nur die
  // Namen-Listen respektieren zeigt_follower_liste, ausser für den
  // Profil-Besitzer selbst, der seine eigenen Listen immer vollständig sieht.
  const isOwnProfile = viewer?.id === id;
  const showFollowLists = isOwnProfile || profile.zeigtFollowerListe;

  // Kein Folgen-Button auf dem eigenen Profil, und nur für eingeloggte
  // Betrachter — dieselbe Bedingung wie beim Kudos-Button oben.
  const showFollow = !!viewer && !isOwnProfile;

  const [kudosByCompletion, followers, following, mutualFollowers, alreadyFollowing] =
    await Promise.all([
    getKudosForCompletions(
      profile.fahrten.map((f) => f.completion_id),
      viewer?.id ?? null,
    ),
    showFollowLists ? getFollowerProfiles(id) : Promise.resolve([]),
    showFollowLists ? getFollowingProfiles(id) : Promise.resolve([]),
    // "Gefolgt von ..." (0053_gefolgt_von_feature.sql) — nur für fremde
    // Profile mit eingeloggtem Betrachter sinnvoll, respektiert
    // zeigt_follower_liste bereits serverseitig in der RPC selbst.
    showFollow
      ? getMutualFollowers(viewer!.id, id)
      : Promise.resolve({ preview: [], totalCount: 0 }),
    // Hing von nichts aus diesem Block ab und lief trotzdem als eigener,
    // nachgelagerter Roundtrip — showFollow steht schon weiter oben fest.
    showFollow ? isFollowing(viewer!.id, id) : Promise.resolve(false),
  ]);

  const zeigtStatistiken = profile.zeigtPaesse || profile.zeigtHoehenmeter || profile.zeigtDistanz;
  const istPrivat =
    !profile.zeigtFahrzeuge && !zeigtStatistiken && profile.fahrten.length === 0;

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10 lg:max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar
              url={profile.zeigtAvatar ? profile.avatarUrl : null}
              name={profile.displayName}
              size={64}
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-display font-semibold">{profile.displayName ?? "Fahrer"}</h1>
              <FollowCounts
                followersCount={followCounts.followers}
                followingCount={followCounts.following}
                followers={followers}
                following={following}
                listsHidden={!showFollowLists}
              />
              {showFollow && (
                <FollowedBy
                  preview={mutualFollowers.preview}
                  totalCount={mutualFollowers.totalCount}
                />
              )}
            </div>
          </div>
          {showFollow && <FollowButton targetUserId={id} initialFollowing={alreadyFollowing} />}
        </div>

        {zeigtStatistiken && (
          <Card as="dl" className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 text-sm sm:grid-cols-3">
            {profile.zeigtPaesse && (
              <div>
                <dt className="text-muted">Pässe befahren</dt>
                <dd className="font-mono text-lg tabular-nums">{profile.passCount}</dd>
              </div>
            )}
            {profile.zeigtHoehenmeter && (
              <div>
                <dt className="text-muted">Höhenmeter gesammelt</dt>
                <dd className="font-mono text-lg tabular-nums">
                  {profile.hoehenmeter.toLocaleString("de-CH")} m
                </dd>
              </div>
            )}
            {profile.zeigtDistanz && (
              <div>
                <dt className="text-muted">GPS-getrackte Distanz</dt>
                <dd className="font-mono text-lg tabular-nums">
                  {profile.distanzKm.toFixed(0)} km
                </dd>
              </div>
            )}
          </Card>
        )}

        <div className="flex flex-col gap-8">
          {/* Volle Breite statt einer festen Desktop-Spalte neben "Gefahrene
              Strecken" — dasselbe Muster wie die Garage auf der eigenen
              Profilseite (app/profil/page.tsx), damit sie an beiden Stellen
              gleich aussieht und auf breiten Bildschirmen mehr Spalten
              zeigen kann statt auf halber Breite zu verharren. */}
          {profile.zeigtFahrzeuge && (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
                <Car className="h-4 w-4" aria-hidden="true" />
                Fahrzeuge
              </h2>
              <VehicleGrid vehicles={profile.vehicles} editable={false} />
            </section>
          )}

          <section className="flex flex-col gap-4">
            {/* Nicht mehr nur "Gefahrene Strecken": die Liste enthält seit
                0045_freie_fahrten_teilen.sql auch geteilte freie Fahrten. */}
            <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
              Geteilte Fahrten
            </h2>
            {profile.fahrten.length === 0 ? (
              <p className="text-sm text-muted">Noch keine öffentlichen Fahrten.</p>
            ) : (
              <Card as="ul" className="divide-y divide-border">
                {profile.fahrten.map((f) => {
                  const kudos = kudosByCompletion.get(f.completion_id);
                  return (
                    <li key={f.completion_id} className="flex items-center gap-2 px-4 py-3">
                      <Link
                        href={`/fahrten/${f.completion_id}`}
                        className="flex min-w-0 flex-1 items-baseline justify-between text-sm transition-colors duration-fast hover:text-accent"
                      >
                        <span className="truncate">
                          {f.art === "frei"
                            ? freieFahrtTitel(f.titel, f.start_ort)
                            : f.route_name}
                        </span>
                        <span className="ml-2 shrink-0 font-mono text-xs tabular-nums text-muted">
                          {new Date(f.datum).toLocaleDateString("de-CH")}
                        </span>
                      </Link>
                      {viewer && (
                        <KudosButton
                          completionId={f.completion_id}
                          initialCount={kudos?.count ?? 0}
                          initialGiven={kudos?.givenByMe ?? false}
                        />
                      )}
                    </li>
                  );
                })}
              </Card>
            )}
          </section>
        </div>

        {istPrivat && <p className="text-sm text-muted">Dieses Profil ist privat.</p>}
        </main>
      </div>
    </div>
  );
}
