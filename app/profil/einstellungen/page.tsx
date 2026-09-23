import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
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
import { premiumKurzform } from "@/lib/premiumVorteile";
import { isModerator } from "@/lib/moderation";
import { istStaging, STAGING_URL } from "@/lib/staging";
import { getOrigin } from "@/lib/utils/url";
import Card from "@/components/ui/Card";
import Button, { buttonVariants } from "@/components/ui/Button";
import { LEGAL_URLS } from "@/lib/constants";
import SectionHeading from "@/components/ui/SectionHeading";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import ProfilnameForm from "@/components/ProfilnameForm";

// Ohne eigenen Titel hiess der Tab auf dieser Seite nur "Strado" — neben
// anderen offenen Tabs derselben App nicht zu unterscheiden.
export const metadata = { title: "Einstellungen – Strado" };

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
        "display_name, zeigt_fahrzeuge, zeigt_avatar, zeigt_paesse, zeigt_hoehenmeter, zeigt_distanz, zeigt_follower_liste, zeigt_tempo, privatzone_radius_m",
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
        <Seitenrahmen>
          <h1 className="text-display font-semibold">Einstellungen</h1>
          {/* Neun Abschnitte auf einer Seite, und wer "Konto" oder
              "Rechtliches" suchte, scrollte an allen vorbei. Eine Zeile
              Sprungmarken oben, horizontal scrollbar auf dem Telefon. Reine
              Anker, kein Client-Code. */}
          <nav aria-label="Abschnitte" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-2">
              {[
              { id: "privatsphaere", label: "Privatsphäre" },
              { id: "darstellung", label: "Darstellung" },
              { id: "meine-strecken", label: "Meine Strecken" },
              { id: "sitzung", label: "Sitzung" },
              { id: "premium", label: "Premium" },
              { id: "konto", label: "Konto" },
              { id: "feedback", label: "Feedback" },
              { id: "rechtliches", label: "Rechtliches" },
              ].map((a) => (
                <li key={a.id}>
                  <a
                    href={`#${a.id}`}
                    className="inline-flex min-h-9 items-center rounded-full border border-border-control px-3 text-sm whitespace-nowrap text-muted transition-colors duration-fast hover:border-muted hover:text-foreground"
                  >
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section id="privatsphaere" className="flex scroll-mt-20 flex-col gap-3">
            <SectionHeading icon={Lock}>Privatsphäre</SectionHeading>
            <p className="text-sm text-muted">
              Legt fest, was andere auf deinem Profil sehen. Ob eine einzelne
              Fahrt öffentlich ist, entscheidest du beim Speichern oder später
              im Profil unter &bdquo;Getrackte Fahrten&ldquo;.
            </p>
            <VisibilitySettings
              zeigtFahrzeuge={profile?.zeigt_fahrzeuge ?? true}
              zeigtAvatar={profile?.zeigt_avatar ?? true}
              zeigtPaesse={profile?.zeigt_paesse ?? true}
              zeigtHoehenmeter={profile?.zeigt_hoehenmeter ?? true}
              zeigtDistanz={profile?.zeigt_distanz ?? true}
              zeigtFollowerListe={profile?.zeigt_follower_liste ?? true}
              zeigtTempo={profile?.zeigt_tempo ?? false}
              privatzoneRadiusM={
                profile?.privatzone_radius_m ?? DEFAULT_PRIVACY_RADIUS_M
              }
            />
          </section>

          <section id="darstellung" className="flex scroll-mt-20 flex-col gap-3">
            <SectionHeading icon={Palette}>Darstellung</SectionHeading>
            {/* Die Erklärung steht UNTER der Marke und AUSSERHALB der Card —
                so wie bei "Privatsphäre" darüber. Vorher hatte diese Seite
                beide Anordnungen: Privatsphäre erklärte sich aussen, die
                fünf Abschnitte darunter innen. Neun Abschnitte, zwei
                Muster. Aussen ist das richtige: beim Überfliegen laufen
                Marke und Erklärung so in einem Zug, und die Card enthält
                nur noch das, was man bedienen kann. */}
            <p className="text-sm text-muted">Farbschema für die ganze App.</p>
            <Card className="p-4">
              <ThemeToggle />
            </Card>
          </section>

          <section id="meine-strecken" className="flex scroll-mt-20 flex-col gap-3">
            <SectionHeading icon={MapPin}>Meine Strecken</SectionHeading>
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
                    // Zwei Zeilen statt einer. Auf 390 px standen Name,
                    // Status, "Bearbeiten" und der Löschen-Knopf in EINER
                    // Zeile: dem Namen blieben bei einer abgelehnten
                    // Strecke rund 120 px, er war also praktisch immer
                    // abgeschnitten — und "Bearbeiten" stand als text-xs
                    // daneben, eine 16 px hohe Tippfläche zwischen zwei
                    // anderen Zielen.
                    //
                    // Jetzt: Name und Status oben (der Status schrumpft
                    // nicht, der Name kürzt), die Handlungen darunter in
                    // ihrer eigenen Zeile mit 44 px Höhe. Ab sm ist genug
                    // Platz, dann läuft wieder alles in einer Zeile.
                    <li
                      key={route.id}
                      className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
                        <Link
                          href={`/strecken/${route.id}`}
                          className="truncate transition-colors duration-fast hover:text-accent"
                        >
                          {route.name}
                        </Link>
                        {/* Der Status als Chip statt als farbiges Wort: dieselbe
                            Form wie die Kategorie-Chips auf der Streckenseite
                            (rounded-full, border, text-xs). */}
                        <span
                          className={`shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${color}`}
                        >
                          {label}
                        </span>
                      </div>
                      {(!route.status_ok || route.abgelehnt_am) && (
                        <div className="-my-1 flex shrink-0 items-center gap-3">
                          {!route.status_ok && (
                            <Link
                              href={`/strecken/${route.id}/bearbeiten`}
                              className="inline-flex min-h-11 items-center text-sm text-muted transition-colors duration-fast hover:text-foreground"
                            >
                              Bearbeiten
                            </Link>
                          )}
                          {route.abgelehnt_am && (
                            <DeleteProposalButton routeId={route.id} />
                          )}
                        </div>
                      )}
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
          <section id="sitzung" className="flex scroll-mt-20 flex-col gap-3">
            <SectionHeading icon={LogOut}>Sitzung</SectionHeading>
            <p className="text-sm text-muted">Du bist auf diesem Gerät angemeldet.</p>
            {/* In einer Card wie "Darstellung" und "Konto" daneben: vorher
                stand der Knopf rahmenlos, während alle Nachbarn Karten sind. */}
            <Card className="p-4">
              <form action="/auth/abmelden" method="post">
                {/* size="md" (44 px): Abmelden ist die einzige Handlung
                    dieses Abschnitts und kein Knopf in einer Zeile. */}
                <Button type="submit" variant="secondary">
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
          {/* Die Zeile steht jetzt für BEIDE Zustände da, nicht nur für
              laufende Abos. Ohne Abo war Premium aus den Einstellungen
              bisher gar nicht erreichbar — der einzige Weg führte über die
              Card zuunterst auf der Profilseite. Eine Zeile unter Gleichen
              ist der unaufdringlichste Ort, den es dafür gibt: kein Banner,
              kein gefüllter Knopf, dieselbe Form wie "Darstellung" und
              "Konto" daneben. Siehe docs/design-vereinfachung.md, Anhang C3,
              Moment 3. */}
          <section id="premium" className="flex scroll-mt-20 flex-col gap-3">
            <SectionHeading icon={Sparkles}>Premium</SectionHeading>
            <p className="text-sm text-muted">
              {premiumStatus.aktiv ? "Abo-Status, Rechnungen, Kündigung." : premiumKurzform()}
            </p>
            {/* Text und Knopf standen nebeneinander in einer Zeile. Ohne Abo
                ist der Text premiumKurzform() und damit ein ganzer Satz —
                auf 390 px blieben dem Knopf daneben rund 120 px, der Satz
                brach auf drei Zeilen um, und die Card wurde höher als die
                aller Nachbarn. Jetzt läuft der Satz über die volle Breite
                und der Knopf steht darunter, wie in "Sitzung" und "Konto". */}
            {/* Der Knopf in einer Card wie in "Sitzung" und "Konto": vorher
                stand er rahmenlos unter einem mehrzeiligen Satz. */}
            <Card className="p-4">
              <Link
                href={premiumStatus.aktiv ? "/profil/einstellungen/abo" : "/profil/premium"}
                className={buttonVariants({ variant: "secondary" })}
              >
                {/* Mit einem Saisonpass gibt es kein Abo zu verwalten —
                    dort führt der Weg zur Übersicht mit Gültigkeit und
                    Rechnung (0110). */}
                {premiumStatus.aktiv
                  ? premiumStatus.quelle === "saisonpass"
                    ? "Premium verwalten"
                    : "Abo verwalten"
                  : "Mehr zu Premium"}
              </Link>
            </Card>
          </section>

          <section id="konto" className="flex scroll-mt-20 flex-col gap-3">
            <SectionHeading icon={KeyRound}>Konto</SectionHeading>
            {/* Alles zum Konto in einer Card: Name, Adresse, Passwort und
                Löschen gehörten vorher drei verschiedenen Behältern an
                (Formular, freier Absatz, Card) und die Kante sprang. */}
            <Card className="flex flex-col gap-4 p-4">
              <ProfilnameForm aktuellerName={profile?.display_name ?? null} />
              {/* break-all an der Adresse: eine lange E-Mail ohne Leerzeichen
                  sprengt auf 390 px sonst die Card nach rechts, statt
                  umzubrechen. */}
              <p className="text-sm">
                <span className="text-muted">E-Mail:</span>{" "}
                <span className="break-all text-foreground">{user.email}</span>
              </p>
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <Link
                  href="/profil/passwort-aendern"
                  className={buttonVariants({ variant: "secondary", className: "self-start" })}
                >
                  Passwort ändern
                </Link>
                <DeleteAccountSection />
              </div>
            </Card>
          </section>

          {zeigeStagingLink && (
            <section className="flex flex-col gap-3">
              <SectionHeading icon={FlaskConical}>Moderation</SectionHeading>
              {/* DIESER TEXT WAR FALSCH, und zwar auf die teure Art. Er
                  versprach "eigene Datenbank" — es gibt keine. Staging
                  redet mit der Produktionsdatenbank (AGENTS.md, Release
                  Flow: ein einziges Supabase-Projekt, vom Eigentümer am
                  2026-09-14 bestätigt und so gewollt). Jedes Testkonto,
                  jede Testfahrt und jede Sandbox-Zahlung dort landet in
                  denselben Tabellen wie echte Nutzerdaten.

                  Ein Satz, der einem Moderator das Gegenteil sagt, lädt
                  genau zu dem ein, wovor die Verfassung warnt. Nur die
                  Stripe-Hälfte stimmte: die Sandbox ist wirklich getrennt,
                  eine Testzahlung kostet kein Geld. */}
              <p className="text-sm text-muted">
                Vorabversion der App, nur für Moderatoren erreichbar.
                Zahlungen laufen über die Stripe-Sandbox und kosten kein
                Geld — die <strong className="font-medium text-foreground">Datenbank ist dieselbe wie
                in der Produktion</strong>. Testkonten, Testfahrten und
                Teststrecken sind echte Daten.
              </p>
              <Card className="p-4">
                <a
                  href={STAGING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Staging öffnen
                </a>
              </Card>
            </section>
          )}

          {/* Vor "Rechtliches" und nach "Konto": eine Rückmeldung ist
              weder eine Kontoeinstellung noch ein Rechtstext, gehört aber
              in dieselbe Gegend wie die anderen Wege nach draussen. Bis
              hierhin führte der einzige davon über die im Impressum
              genannte Adresse — für jemanden, der gerade in der App auf
              einen Fehler gestossen ist, kein auffindbarer Weg. */}
          <section id="feedback" className="flex scroll-mt-20 flex-col gap-3">
            <SectionHeading icon={MessageSquare}>Feedback</SectionHeading>
            <p className="text-sm text-muted">
              Fehler gefunden, etwas vermisst oder eine Idee? Schreib uns direkt aus der App.
            </p>
            <Card className="p-4">
              <FeedbackDialog />
            </Card>
          </section>

          <section id="rechtliches" className="flex scroll-mt-20 flex-col gap-3">
            <SectionHeading icon={Scale}>Rechtliches</SectionHeading>
            {/* Drei gleiche Zeilen aus einer Schleife statt dreimal
                derselben Klassenkette: min-h-11 (die Zeilen waren 41 px und
                damit knapp unter der Tippgrenze) und ein Pfeil, der sagt,
                dass der Link die App verlässt — alle drei öffnen strado.ch
                in einem neuen Tab, und das stand nirgends. */}
            <Card as="ul" className="divide-y divide-border">
              {[
                { href: LEGAL_URLS.impressum, label: "Impressum" },
                { href: LEGAL_URLS.datenschutz, label: "Datenschutzerklärung" },
                { href: LEGAL_URLS.agb, label: "AGB" },
              ].map((eintrag) => (
                <li key={eintrag.href}>
                  <a
                    href={eintrag.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm transition-colors duration-fast hover:text-accent"
                  >
                    {eintrag.label}
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="sr-only">(öffnet in neuem Tab)</span>
                  </a>
                </li>
              ))}
            </Card>
          </section>
        </Seitenrahmen>
      </div>
    </div>
  );
}
