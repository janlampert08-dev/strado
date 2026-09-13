import { redirect } from "next/navigation";
import Link from "next/link";
import {
  FlaskConical,
  KeyRound,
  Lock,
  LogOut,
  MapPin,
  MessageSquare,
  Palette,
  Scale,
  Sparkles,
} from "lucide-react";
import Header from "@/components/Header";
import VisibilitySettings from "@/components/VisibilitySettings";
import { DEFAULT_PRIVACY_RADIUS_M } from "@/lib/track";
import ThemeToggle from "@/components/ThemeToggle";
import DeleteProposalButton from "@/components/DeleteProposalButton";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import FeedbackDialog from "@/components/FeedbackDialog";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/premium";
import { isModerator } from "@/lib/moderation";
import { istStaging, STAGING_URL } from "@/lib/staging";
import { getOrigin } from "@/lib/utils/url";
import Card from "@/components/ui/Card";
import Button, { buttonVariants } from "@/components/ui/Button";
import { LEGAL_URLS } from "@/lib/constants";

// Ein Einstellungen-Tab statt vorher verstreuter Zugänge: Privatsphäre
// (bisher app/profil/privatsphaere, hierher verschoben), Darstellung
// (Hell/Dunkel — bisher nur im Header erreichbar, hier zusätzlich für
// Auffindbarkeit), Streckenvorschläge (bisher Teil der "Verwaltung"-Gruppe
// auf der Profilseite), Sitzung (Abmelden) und Konto (Passwort ändern,
// Konto löschen — bisher ohne jeden Einstieg aus der UI ausser dem
// Passwort-Reset-Link).
//
// Vormals ein Tab-Widget (SettingsTabs.tsx, seither entfernt): gestapelte
// Sections mit eigener Card statt Tabs, dasselbe Muster wie die Profilseite
// (app/profil/page.tsx) — kein Klick nötig, um zu sehen, was es überhaupt
// gibt, und kein separates Tab-Primitiv nur für diese eine Seite.
export default async function EinstellungenPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");

  // Der Moderator-Status ist pro Request memoisiert (lib/moderation.ts) und
  // wird auf dieser Seite ohnehin schon vom <Header /> abgefragt — die
  // zusätzliche Abfrage hier kostet also nichts.
  const [
    { data: profile },
    { data: ownRoutes },
    premiumStatus,
    istMod,
    origin,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "zeigt_fahrzeuge, zeigt_avatar, zeigt_paesse, zeigt_hoehenmeter, zeigt_distanz, zeigt_follower_liste, privatzone_radius_m",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("routes")
      .select("id, name, status_ok, abgelehnt_am, ist_privat")
      .eq("erstellt_von", user.id)
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          name: string;
          status_ok: boolean;
          abgelehnt_am: string | null;
          ist_privat: boolean;
        }[]
      >(),
    getPremiumStatus(),
    isModerator(user.id),
    getOrigin(),
  ]);

  // Der Einstieg in die Staging-Umgebung — nur für Moderatoren, und nur von
  // der Produktion aus: auf Staging selbst wäre der Link ein Verweis auf die
  // Seite, auf der man schon steht. Das Gate in proxy.ts weist ohnehin jeden
  // ab, der dort kein Moderator ist; dieser Link ist die Auffindbarkeit, nicht
  // die Absicherung.
  const zeigeStagingLink = istMod && !istStaging(new URL(origin).hostname);

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:px-6 sm:py-10 lg:max-w-3xl">
          <h1 className="text-display font-semibold">Einstellungen</h1>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Privatsphäre
            </h2>
            <p className="text-sm text-muted">
              Legt fest, was andere auf deinem Profil sehen. Ob eine einzelne
              Fahrt öffentlich ist, entscheidest du beim Speichern oder in
              &bdquo;Getrackte Fahrten&ldquo;.
            </p>
            <VisibilitySettings
              zeigtFahrzeuge={profile?.zeigt_fahrzeuge ?? true}
              zeigtAvatar={profile?.zeigt_avatar ?? true}
              zeigtPaesse={profile?.zeigt_paesse ?? true}
              zeigtHoehenmeter={profile?.zeigt_hoehenmeter ?? true}
              zeigtDistanz={profile?.zeigt_distanz ?? true}
              zeigtFollowerListe={profile?.zeigt_follower_liste ?? true}
              privatzoneRadiusM={
                profile?.privatzone_radius_m ?? DEFAULT_PRIVACY_RADIUS_M
              }
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
              <Palette className="h-4 w-4" aria-hidden="true" />
              Darstellung
            </h2>
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-sm text-muted">
                Farbschema für die ganze App.
              </p>
              <ThemeToggle />
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Meine Strecken
            </h2>
            {ownRoutes && ownRoutes.length > 0 ? (
              <Card as="ul" className="divide-y divide-border">
                {ownRoutes.map((route) => {
                  const label = route.status_ok
                    ? "Bewilligt"
                    : route.ist_privat
                      ? "Privat"
                      : route.abgelehnt_am
                        ? "Abgelehnt"
                        : "Ausstehend";
                  const color = route.status_ok
                    ? "text-accent"
                    : route.abgelehnt_am
                      ? "text-danger"
                      : "text-muted";
                  return (
                    <li
                      key={route.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <Link
                        href={`/strecken/${route.id}`}
                        className="truncate transition-colors duration-fast hover:text-accent"
                      >
                        {route.name}
                      </Link>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={`text-sm font-medium ${color}`}>
                          {label}
                        </span>
                        {!route.status_ok && (
                          <Link
                            href={`/strecken/${route.id}/bearbeiten`}
                            className="text-xs text-muted hover:text-foreground"
                          >
                            Bearbeiten
                          </Link>
                        )}
                        {route.abgelehnt_am && (
                          <DeleteProposalButton routeId={route.id} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </Card>
            ) : (
              <p className="text-sm text-muted">Noch keine eigenen Strecken.</p>
            )}
          </section>

          {/* Abmelden als eigener Abschnitt, bewusst getrennt von "Konto
              löschen": vorher stand die alltägliche Aktion eine Zeile über
              der unumkehrbaren, in derselben Card. Wer schnell abmelden
              will, soll dabei nichts Endgültiges streifen. */}
          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sitzung
            </h2>
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-sm text-muted">
                Du bist auf diesem Gerät angemeldet.
              </p>
              <form action="/auth/abmelden" method="post">
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  className="self-start"
                >
                  Abmelden
                </Button>
              </form>
            </Card>
          </section>

          {/* Nur für Abonnenten: ohne Abo gibt es hier nichts zu verwalten,
              und "Abo-Status, Rechnungen, Kündigung" verspräche etwas, das
              es für dieses Konto nicht gibt. Der Kauf-Einstieg liegt
              bewusst nicht hier, sondern auf der Profilseite (PremiumCard,
              "Premium holen") — Einstellungen bleiben frei von Werbung.
              app/profil/einstellungen/abo leitet ohne Abo entsprechend auf
              die Kaufseite um.

              Der Zustand entscheidet hier nur über die Sichtbarkeit; die
              Zahlen dazu (Plan, Verlängerungsdatum, Kulanzfrist) stehen
              ausschliesslich in PremiumCard. Zwei Quellen fürs selbe Datum
              wären eine, die auseinanderlaufen kann. */}
          {premiumStatus.aktiv && (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Premium
              </h2>
              <Card className="flex items-center justify-between gap-3 p-4">
                <p className="text-sm text-muted">
                  Abo-Status, Rechnungen, Kündigung.
                </p>
                <Link
                  href="/profil/einstellungen/abo"
                  className={buttonVariants({
                    variant: "secondary",
                    size: "sm",
                    className: "shrink-0",
                  })}
                >
                  Abo verwalten
                </Link>
              </Card>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Konto
            </h2>
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-sm">
                <span className="text-muted">E-Mail:</span>{" "}
                <span className="text-foreground">{user.email}</span>
              </p>
              <Link
                href="/profil/passwort-aendern"
                className={buttonVariants({
                  variant: "secondary",
                  size: "sm",
                  className: "self-start",
                })}
              >
                Passwort ändern
              </Link>
              <DeleteAccountSection />
            </Card>
          </section>

          {zeigeStagingLink && (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
                <FlaskConical className="h-4 w-4" aria-hidden="true" />
                Moderation
              </h2>
              <Card className="flex flex-col gap-2 p-4">
                <a
                  href={STAGING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent underline underline-offset-2 self-start"
                >
                  Staging-Umgebung öffnen
                </a>
                <p className="text-xs text-muted">
                  Vorabversion mit eigener Datenbank und Test-Zahlungen. Nur für
                  Moderatoren erreichbar.
                </p>
              </Card>
            </section>
          )}

          {/* Vor "Rechtliches" und nach "Konto": eine Rückmeldung ist
              weder eine Kontoeinstellung noch ein Rechtstext, gehört aber
              in dieselbe Gegend wie die anderen Wege nach draussen. Bis
              hierhin führte der einzige davon über die im Impressum
              genannte Adresse — für jemanden, der gerade in der App auf
              einen Fehler gestossen ist, kein auffindbarer Weg. */}
          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Feedback
            </h2>
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-sm text-muted">
                Fehler gefunden, etwas vermisst oder eine Idee? Schreib uns direkt aus der App.
              </p>
              <FeedbackDialog />
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted uppercase">
              <Scale className="h-4 w-4" aria-hidden="true" />
              Rechtliches
            </h2>
            <Card className="flex flex-col divide-y divide-border p-0">
              <a
                href={LEGAL_URLS.impressum}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 text-sm transition-colors duration-fast hover:text-accent"
              >
                Impressum
              </a>
              <a
                href={LEGAL_URLS.datenschutz}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 text-sm transition-colors duration-fast hover:text-accent"
              >
                Datenschutzerklärung
              </a>
              <a
                href={LEGAL_URLS.agb}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 text-sm transition-colors duration-fast hover:text-accent"
              >
                AGB
              </a>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
