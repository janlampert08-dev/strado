import { notFound } from "next/navigation";
import { datumCH } from "@/lib/format";
import type { Metadata } from "next";
import { OG_GEERBT } from "@/lib/openGraph";
import Link from "next/link";
import { Car, Route as RouteIcon } from "lucide-react";
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
import Kennzahl, { Kennzahlen } from "@/components/ui/Kennzahl";
import { freieFahrtTitel } from "@/lib/completions";
import SectionHeading from "@/components/ui/SectionHeading";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) return { title: "Fahrer – Strado" };
  const name = profile.displayName ?? "Ein Fahrer";
  // Kurz und ohne Kennzahlen: Welche davon überhaupt sichtbar sind,
  // entscheiden die zeigt_*-Schalter des Nutzers (lib/profile.ts). Sie in
  // die Beschreibung zu ziehen würde diese Entscheidung an Suchmaschinen
  // vorbei aushebeln — deshalb bewusst nur der Name.
  const beschreibung = `Profil von ${name} auf Strado: gefahrene Strecken und Touren.`;
  return {
    title: `${name} – Strado`,
    description: beschreibung,
    // description muss im openGraph-Block wiederholt werden — Next zieht
    // sie nicht automatisch nach, sobald der Block eigene Felder hat.
    openGraph: { ...OG_GEERBT, type: "profile", title: `${name} – Strado`, description: beschreibung },
    // noindex statt eines Disallow in robots.ts: app/sitemap.ts lässt
    // Fahrer-Profile aus Datenschutzgründen aus, aber /feed verlinkt jedes
    // von ihnen. Ein Disallow verbietet nur das ABRUFEN — die URL kann über
    // solche Links trotzdem im Index landen, dann eben ohne Inhalt, und der
    // Crawler bekommt diese Anweisung hier nie zu sehen, weil er die Seite
    // gar nicht erst holen darf. Genau umgekehrt wirkt es: crawlen lassen,
    // damit das noindex ankommt.
    robots: { index: false, follow: true },
  };
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
        <Seitenrahmen>
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
          <Kennzahlen>
            {/* Null-Werte weglassen: "Pässe befahren 0" neben 1'380
                Höhenmetern las sich im Review wie ein Fehler, nicht wie eine
                Auskunft. Dieselbe Primitive wie Profil, Strecke und Fahrt —
                dritte Schriftgrösse war keine Hierarchie, sondern Zufall. */}
            {profile.zeigtPaesse && profile.passCount > 0 && (
              <Kennzahl beschriftung="Pässe befahren" wert={profile.passCount} />
            )}
            {profile.zeigtHoehenmeter && profile.hoehenmeter > 0 && (
              <Kennzahl
                beschriftung="Höhenmeter"
                wert={`${profile.hoehenmeter.toLocaleString("de-CH")} m`}
              />
            )}
            {profile.zeigtDistanz && profile.distanzKm > 0 && (
              <Kennzahl
                beschriftung="Distanz"
                wert={`${profile.distanzKm.toFixed(0)} km`}
              />
            )}
          </Kennzahlen>
        )}

        <div className="flex flex-col gap-8">
          {/* Volle Breite statt einer festen Desktop-Spalte neben "Gefahrene
              Strecken" — dasselbe Muster wie die Garage auf der eigenen
              Profilseite (app/profil/page.tsx), damit sie an beiden Stellen
              gleich aussieht und auf breiten Bildschirmen mehr Spalten
              zeigen kann statt auf halber Breite zu verharren. */}
          {profile.zeigtFahrzeuge && (
            <section className="flex flex-col gap-3">
              <SectionHeading icon={Car}>Fahrzeuge</SectionHeading>
              <VehicleGrid vehicles={profile.vehicles} editable={false} />
            </section>
          )}

          <section className="flex flex-col gap-4">
            {/* Nicht mehr nur "Gefahrene Strecken": die Liste enthält seit
                0045_freie_fahrten_teilen.sql auch geteilte freie Fahrten. */}
            <SectionHeading icon={RouteIcon}>Geteilte Fahrten</SectionHeading>
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
                        // min-h-11: die Zeile ist ein Link auf die Fahrt, war
                        // aber nur so hoch wie ihre Schrift (20 px).
                        className="flex min-h-11 min-w-0 flex-1 items-center justify-between text-sm transition-colors duration-fast hover:text-accent"
                      >
                        <span className="truncate">
                          {f.art === "frei"
                            ? freieFahrtTitel(f.titel, f.start_ort)
                            : f.route_name}
                        </span>
                        <span className="ml-2 shrink-0 text-xs tabular-nums text-muted">
                          {datumCH(new Date(f.datum))}
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
        </Seitenrahmen>
      </div>
    </div>
  );
}
