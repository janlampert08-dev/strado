import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import ModerationActions from "@/components/ModerationActions";
import ReportedContentActions from "@/components/ReportedContentActions";
import FeedbackActions from "@/components/FeedbackActions";
import PassStatusForm from "@/components/PassStatusForm";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  isModerator,
  getPendingRoutes,
  getOpenRouteReports,
  getOpenRatingReports,
  getOpenCompletionReports,
  getOpenFeedback,
} from "@/lib/moderation";
import type { ComponentType } from "react";
import { formatKm, datumCH } from "@/lib/format";
import { getPassStreckenMitStatus } from "@/lib/passStatusAbfragen";
import { passStatusAnzeige } from "@/lib/passStatus";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import SectionHeading from "@/components/ui/SectionHeading";
import { buttonVariants } from "@/components/ui/Button";
import { MapPinIcon, ShieldIcon, LinkIcon, FeedbackIcon, MailIcon, PassIcon } from "@/components/NavIcons";
import { POSTFACH_URL } from "@/lib/constants";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

export const metadata = { title: "Moderation – Strado" };

// Wie REPORT_REASON_LABEL: die Werte kommen aus der Datenbank, die
// Beschriftungen stehen in lib/constants.ts (FEEDBACK_KATEGORIEN). Hier als
// Nachschlagetabelle statt eines find() über die Konstante, damit ein
// künftiger Wert ohne Beschriftung als sich selbst angezeigt wird, statt zu
// verschwinden.
const FEEDBACK_KATEGORIE_LABEL: Record<string, string> = {
  fehler: "Fehler",
  idee: "Idee oder Wunsch",
  lob: "Lob",
  sonstiges: "Sonstiges",
};

const REPORT_REASON_LABEL: Record<string, string> = {
  unangemessen: "Unangemessener Inhalt",
  spam: "Spam",
  falsche_angaben: "Falsche Angaben",
  sonstiges: "Sonstiges",
};

/** Art des Eintrags — die eine Angabe, die beim Überfliegen zuerst gebraucht
 *  wird ("Strecke oder Kommentar oder Fahrt?"). Dieselbe Pille wie im Profil
 *  und auf /moderation/creator, hier aber in der Vordergrundfarbe: sie ist
 *  hier eine Einordnung, kein Nebenhinweis. */
function Kennzeichen({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}

/** Fremder Text, über den entschieden werden soll — Charaktertext eines
 *  Vorschlags, gemeldeter Kommentar, Fahrtnotiz, Rückmeldung.
 *
 *  Vorher stand all das als gewöhnlicher Fliesstext in der Karte, nur durch
 *  „…“ und ein vorangestelltes "Meldungsgrund:" von der Oberfläche der App
 *  selbst getrennt. Genau diese Grenze muss ein Moderationswerkzeug aber
 *  zeigen: was jemand geschrieben hat, und was die App dazu sagt. Der
 *  Randstrich macht sie sichtbar, die Beschriftung benennt die Herkunft.
 *
 *  whitespace-pre-line, weil all diese Texte getippter Fliesstext sind und
 *  ihre Absätze zur Aussage gehören. */
function Zitat({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="border-l-2 border-border pl-3">
      {label && <p className="text-xs text-muted">{label}</p>}
      <blockquote className="text-sm whitespace-pre-line text-foreground">{children}</blockquote>
    </div>
  );
}

/** Abschnittsmarke mit Anzahl — dieselbe Zählpille wie im Profil. */
function AbschnittKopf({
  title,
  count,
  icon,
}: {
  title: string;
  count: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <SectionHeading icon={icon}>{title}</SectionHeading>
      <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted">
        {count}
      </span>
    </div>
  );
}

/** Sprungmarke auf einen der drei Abschnitte.
 *
 *  Der Zweck ist nicht Zierrat, sondern die Länge der Seite: bei zwanzig
 *  offenen Vorschlägen liegt das Feedback mehrere Bildschirmhöhen weiter
 *  unten, und bis hierher stand nirgends, ob dort überhaupt etwas wartet.
 *  Eine leere Warteschlange bleibt gedämpft, eine gefüllte tritt hervor. */
function Sprungmarke({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <a
      href={href}
      className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2.5 transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="text-xs text-muted">{label}</span>
      <span
        className={`font-mono text-title font-semibold tabular-nums ${
          count === 0 ? "text-muted" : "text-foreground"
        }`}
      >
        {count}
      </span>
    </a>
  );
}

export default async function ModerationPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");
  if (!(await isModerator(user.id))) redirect("/");

  const [routes, routeReports, ratingReports, completionReports, feedback, paesse] =
    await Promise.all([
      getPendingRoutes(),
      getOpenRouteReports(),
      getOpenRatingReports(),
      getOpenCompletionReports(),
      getOpenFeedback(),
      getPassStreckenMitStatus(),
    ]);

  // Einmal pro Seitenaufbau, nicht pro Pass: sonst könnte die Liste zwei
  // Zeitpunkte mischen, und "veraltet" ist eine Aussage über einen
  // Stichtag.
  const jetzt = new Date();

  // Die drei Meldungsarten in eine Liste, chronologisch. Vorher standen sie
  // als drei Blöcke untereinander — wer die Warteschlange von oben abarbeitet,
  // sah damit zuerst jede Streckenmeldung, egal wie frisch, und die älteste
  // gemeldete Fahrt zuletzt. Die Reihenfolge in einer Warteschlange sollte
  // das Alter sein, nicht die Sorte; die Sorte steht jetzt als Kennzeichen an
  // der Karte. Jede Teilliste kommt bereits aufsteigend nach erstellt_am aus
  // lib/moderation.ts, das Zusammenführen erhält das nur.
  const meldungen = [
    ...routeReports.map((report) => ({
      key: `strecke-${report.id}`,
      art: "Strecke",
      grund: report.grund,
      erstelltAm: report.erstelltAm,
      href: `/strecken/${report.routeId}`,
      titel: report.routeName,
      // Bei einer gemeldeten Strecke gibt es keinen zitierbaren Text — was
      // beurteilt werden soll, ist die Strecke hinter dem Link.
      inhalt: null as string | null,
      begruendung: report.kommentar,
      aktionen: (
        <ReportedContentActions
          reportId={report.id}
          targetId={report.routeId}
          type="route"
          deleteConfirmDescription={`"${report.routeName}" wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.`}
        />
      ),
    })),
    ...ratingReports.map((report) => ({
      key: `kommentar-${report.id}`,
      art: "Kommentar",
      grund: report.grund,
      erstelltAm: report.erstelltAm,
      href: `/strecken/${report.routeId}`,
      titel: report.routeName,
      inhalt: report.ratingKommentar,
      begruendung: report.kommentar,
      aktionen: (
        <ReportedContentActions
          reportId={report.id}
          targetId={report.ratingId}
          type="rating"
          deleteConfirmDescription="Der Kommentar wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden."
        />
      ),
    })),
    ...completionReports.map((report) => ({
      key: `fahrt-${report.id}`,
      art: report.istFreieFahrt ? "Freie Fahrt" : "Fahrt",
      grund: report.grund,
      erstelltAm: report.erstelltAm,
      href: `/fahrten/${report.completionId}`,
      titel: report.fahrtTitel,
      inhalt: report.fahrtNotiz,
      begruendung: report.kommentar,
      aktionen: (
        <ReportedContentActions
          reportId={report.id}
          targetId={report.completionId}
          type="completion"
          deleteConfirmDescription="Die Fahrt verschwindet aus Feed und öffentlichem Profil, inklusive ihrer Karte. Der Fahrer behält seine Aufzeichnung."
        />
      ),
    })),
  ].sort((a, b) => a.erstelltAm.localeCompare(b.erstelltAm));

  const offeneVorgaenge = routes.length + meldungen.length + feedback.length;

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        {/* Innenabstände wie auf jeder anderen Inhaltsseite (Feed, Profil,
            Bestenlisten) und wie im Skelett nebenan — px-6 py-10 auch auf dem
            Telefon war der Ausreisser, und das Skelett sprang beim Auflösen
            entsprechend. */}
        <Seitenrahmen>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-display font-semibold">Moderation</h1>
              <p className="text-sm text-muted">
                {offeneVorgaenge === 0
                  ? "Nichts offen — die Warteschlange ist leer."
                  : `${offeneVorgaenge} ${offeneVorgaenge === 1 ? "offener Vorgang" : "offene Vorgänge"}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Fremdes Ziel, deshalb ein gewöhnliches <a> statt next/link
                  und ein eigener Tab: die Warteschlange, die gerade
                  abgearbeitet wird, soll beim Nachsehen im Postfach nicht
                  verloren gehen. Ohne gesetzte MODERATION_POSTFACH_URL
                  (siehe lib/constants.ts) erscheint der Link nicht. */}
              {POSTFACH_URL && (
                <a
                  href={POSTFACH_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  <MailIcon className="h-4 w-4" aria-hidden="true" />
                  Postfach
                </a>
              )}
              {/* Sprung in den Abschnitt weiter unten, kein neuer
                  Navigationspunkt und keine eigene Seite
                  (docs/premium-ausbau-plan.md §1). Ein <a> statt next/link:
                  ein Anker auf derselben Seite. */}
              <a href="#paesse" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <PassIcon className="h-4 w-4" aria-hidden="true" />
                Passstatus
              </a>
              <Link
                href="/moderation/creator"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                <LinkIcon className="h-4 w-4" aria-hidden="true" />
                Creator-Links
              </Link>
            </div>
          </div>

          <nav aria-label="Abschnitte" className="grid grid-cols-3 gap-2 sm:gap-3">
            <Sprungmarke href="#vorschlaege" label="Vorschläge" count={routes.length} />
            <Sprungmarke href="#meldungen" label="Meldungen" count={meldungen.length} />
            <Sprungmarke href="#feedback" label="Feedback" count={feedback.length} />
          </nav>

          <section id="vorschlaege" className="flex scroll-mt-4 flex-col gap-3">
            <AbschnittKopf title="Streckenvorschläge" count={routes.length} icon={MapPinIcon} />

            {routes.length === 0 ? (
              <EmptyState icon={MapPinIcon} title="Kein Streckenvorschlag wartet auf Freigabe." />
            ) : (
              routes.map((route) => (
                <Card key={route.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <Link
                      href={`/strecken/${route.id}`}
                      className="-my-1.5 py-1.5 font-medium transition-colors duration-fast hover:text-accent"
                    >
                      {route.name}
                    </Link>
                    {/* Das Einreichungsdatum stand bisher nirgends. In einer
                        Warteschlange ist das Alter aber die Angabe, nach der
                        entschieden wird, was als Nächstes drankommt. */}
                    <span className="font-mono text-xs tabular-nums text-muted">
                      {datumCH(new Date(route.created_at))}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {route.region} · {route.start_ort} → {route.ziel_ort} ·{" "}
                    <span className="font-mono tabular-nums">{formatKm(route.laenge_km)} km</span>
                  </p>
                  {route.charakter_text && <Zitat>{route.charakter_text}</Zitat>}
                  <ModerationActions routeId={route.id} />
                </Card>
              ))
            )}
          </section>

          <section id="meldungen" className="flex scroll-mt-4 flex-col gap-3">
            <AbschnittKopf title="Gemeldete Inhalte" count={meldungen.length} icon={ShieldIcon} />

            {meldungen.length === 0 ? (
              <EmptyState icon={ShieldIcon} title="Keine offenen Meldungen." />
            ) : (
              meldungen.map((meldung) => (
                <Card key={meldung.key} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Kennzeichen>{meldung.art}</Kennzeichen>
                    <span className="text-xs text-muted">
                      {REPORT_REASON_LABEL[meldung.grund] ?? meldung.grund}
                    </span>
                    <span className="ml-auto font-mono text-xs tabular-nums text-muted">
                      {datumCH(new Date(meldung.erstelltAm))}
                    </span>
                  </div>
                  <Link
                    href={meldung.href}
                    className="-my-1.5 py-1.5 font-medium transition-colors duration-fast hover:text-accent"
                  >
                    {meldung.titel}
                  </Link>
                  {meldung.inhalt && <Zitat label="Gemeldeter Inhalt">{meldung.inhalt}</Zitat>}
                  {meldung.begruendung && (
                    <Zitat label="Begründung der Meldung">{meldung.begruendung}</Zitat>
                  )}
                  {meldung.aktionen}
                </Card>
              ))
            )}
          </section>

          {/* Rückmeldungen aus den Einstellungen (0083_feedback.sql). Bewusst
              ein eigener Abschnitt statt einer vierten Sorte unter "Gemeldete
              Inhalte": Feedback ist keine Meldung über jemanden, und die
              Zählung oben soll nicht durch etwas steigen, das niemanden
              betrifft. */}
          <section id="feedback" className="flex scroll-mt-4 flex-col gap-3">
            <AbschnittKopf title="Feedback" count={feedback.length} icon={FeedbackIcon} />

            {feedback.length === 0 ? (
              <EmptyState icon={FeedbackIcon} title="Keine offenen Rückmeldungen." />
            ) : (
              feedback.map((eintrag) => (
                <Card key={eintrag.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Kennzeichen>
                      {FEEDBACK_KATEGORIE_LABEL[eintrag.kategorie] ?? eintrag.kategorie}
                    </Kennzeichen>
                    {eintrag.absender && (
                      <span className="text-xs text-muted">von {eintrag.absender}</span>
                    )}
                    <span className="ml-auto font-mono text-xs tabular-nums text-muted">
                      {datumCH(new Date(eintrag.erstelltAm))}
                    </span>
                  </div>
                  <Zitat>{eintrag.nachricht}</Zitat>
                  <FeedbackActions feedbackId={eintrag.id} />
                </Card>
              ))
            )}
          </section>

          {/* Passstatus (0112). Kein Vorgang in der Warteschlange, sondern
              eine Pflegeliste — deshalb ohne Sprungmarke in der Zählleiste
              oben, die offene Vorgänge zählt, und ohne Eingang in
              offeneVorgaenge. Die Reihenfolge kommt aus der Abfrage: ohne
              Status zuerst, dann die am längsten nicht geprüften. */}
          <section id="paesse" className="flex scroll-mt-4 flex-col gap-3">
            <AbschnittKopf title="Passstatus" count={paesse.length} icon={PassIcon} />

            {paesse.length === 0 ? (
              <EmptyState
                icon={PassIcon}
                title="Keine freigegebene Strecke trägt die Kategorie Passstrasse."
              />
            ) : (
              paesse.map((pass) => {
                const anzeige = pass.status ? passStatusAnzeige(pass.status, jetzt) : null;
                return (
                  <Card key={pass.id} className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <Link
                        href={`/strecken/${pass.id}`}
                        className="-my-1.5 py-1.5 font-medium transition-colors duration-fast hover:text-accent"
                      >
                        {pass.name}
                      </Link>
                      {/* Derselbe Satz wie auf der Streckenseite — was hier
                          gespeichert wird, steht dort. */}
                      <span
                        className={`text-xs ${anzeige?.veraltet ? "text-warning" : "text-muted"}`}
                      >
                        {anzeige
                          ? `${anzeige.label} · ${anzeige.geprueft}`
                          : "Noch nicht erfasst"}
                      </span>
                    </div>
                    <p className="text-sm text-muted">{pass.region}</p>
                    {/* Aufgeklappt nur, solange nichts erfasst ist: dann ist
                        das Formular die Arbeit, die hier wartet. Sonst
                        zusammengefaltet, damit die Liste überblickbar
                        bleibt — dasselbe <details>-Muster wie im Profil. */}
                    <details open={!pass.status}>
                      <summary className="cursor-pointer text-sm text-muted">
                        {pass.status ? "Status prüfen oder ändern" : "Status erfassen"}
                      </summary>
                      <div className="pt-3">
                        <PassStatusForm routeId={pass.id} status={pass.status} />
                      </div>
                    </details>
                  </Card>
                );
              })
            )}
          </section>
        </Seitenrahmen>
      </div>
    </div>
  );
}
