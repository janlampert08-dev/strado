import { notFound } from "next/navigation";
import { datumCH, formatMeter } from "@/lib/format";
import type { Metadata } from "next";
import { OG_GEERBT } from "@/lib/openGraph";
import Link from "next/link";
import { Car, Route as RouteIcon } from "@/components/NavIcons";
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
  getFolgeZustand,
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
  const beschreibung = `Profil von ${name} auf Strado: Fahrten und Strecken.`;
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

  const [kudosByCompletion, followers, following, mutualFollowers, folgeZustand] =
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
    // Seit 0146 drei Zustände (folgt / angefragt / keiner) plus die
    // Einstellung des Profils, ob es Follower bestätigt.
    showFollow
      ? getFolgeZustand(viewer!.id, id)
      : Promise.resolve({ zustand: "keiner" as const, brauchtBestaetigung: false }),
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
              {/* wrap-anywhere statt break-words: Die Überschrift steckt in zwei
                  flex-Zeilen, und nur anywhere senkt die Mindestbreite — ein
                  langer Name ohne Leerzeichen bricht so um, statt die Zeile
                  samt Folgen-Knopf aus dem Bild zu schieben. */}
              <h1 className="text-display font-semibold wrap-anywhere">{profile.displayName ?? "Fahrer"}</h1>
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
          {showFollow && (
            <FollowButton
              targetUserId={id}
              initialZustand={folgeZustand.zustand}
              brauchtBestaetigung={folgeZustand.brauchtBestaetigung}
            />
          )}
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
                wert={formatMeter(profile.hoehenmeter)}
              />
            )}
            {profile.zeigtDistanz && profile.distanzKm > 0 && (
              <Kennzahl
                beschriftung="Distanz"
                // Schweizer Tausendertrennung wie bei den Höhenmetern darüber
                // und im eigenen Profil — "1234 km" neben "12’345 m" las sich
                // wie zwei Schreibweisen.
                wert={`${Math.round(profile.distanzKm).toLocaleString("de-CH")}\u00a0km`}
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
                        className="flex min-h-11 min-w-0 flex-1 items-center justify-between text-sm transition-colors duration-fast hover:text-accent-ink"
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
