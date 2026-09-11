import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import ModerationActions from "@/components/ModerationActions";
import ReportedContentActions from "@/components/ReportedContentActions";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  isModerator,
  getPendingRoutes,
  getOpenRouteReports,
  getOpenRatingReports,
  getOpenCompletionReports,
} from "@/lib/moderation";
import { formatKm } from "@/lib/format";
import Card from "@/components/ui/Card";

const REPORT_REASON_LABEL: Record<string, string> = {
  unangemessen: "Unangemessener Inhalt",
  spam: "Spam",
  falsche_angaben: "Falsche Angaben",
  sonstiges: "Sonstiges",
};

export default async function ModerationPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");
  if (!(await isModerator(user.id))) redirect("/");

  const [routes, routeReports, ratingReports, completionReports] = await Promise.all([
    getPendingRoutes(),
    getOpenRouteReports(),
    getOpenRatingReports(),
    getOpenCompletionReports(),
  ]);

  const offeneMeldungen = routeReports.length + ratingReports.length + completionReports.length;

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-display font-semibold">Moderation</h1>
          <p className="text-sm text-muted">
            {routes.length}{" "}
            {routes.length === 1
              ? "unveröffentlichter Streckenvorschlag"
              : "unveröffentlichte Streckenvorschläge"}
          </p>
          <p className="mt-1 text-sm">
            <Link href="/moderation/creator" className="text-accent hover:underline">
              Creator-Links
            </Link>
          </p>
        </div>

        {routes.length === 0 ? (
          <p className="text-sm text-muted">Keine offenen Vorschläge.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {routes.map((route) => (
              <Card key={route.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <Link
                      href={`/strecken/${route.id}`}
                      className="font-medium transition-colors duration-fast hover:text-accent"
                    >
                      {route.name}
                    </Link>
                    <p className="text-sm text-muted">
                      {route.region} · {route.start_ort} → {route.ziel_ort} ·{" "}
                      <span className="font-mono tabular-nums">{formatKm(route.laenge_km)} km</span>
                    </p>
                  </div>
                </div>
                {route.charakter_text && (
                  <p className="text-sm text-foreground">{route.charakter_text}</p>
                )}
                <ModerationActions routeId={route.id} />
              </Card>
            ))}
          </div>
        )}

        <div className="mt-4">
          <h2 className="text-display font-semibold">Gemeldete Inhalte</h2>
          <p className="text-sm text-muted">
            {offeneMeldungen} {offeneMeldungen === 1 ? "offene Meldung" : "offene Meldungen"}
          </p>
        </div>

        {offeneMeldungen === 0 ? (
          <p className="text-sm text-muted">Keine offenen Meldungen.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {routeReports.map((report) => (
              <Card key={report.id} className="flex flex-col gap-3 p-4">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                    Strecke gemeldet · {REPORT_REASON_LABEL[report.grund] ?? report.grund}
                  </p>
                  <Link
                    href={`/strecken/${report.routeId}`}
                    className="font-medium transition-colors duration-fast hover:text-accent"
                  >
                    {report.routeName}
                  </Link>
                  {report.kommentar && (
                    <p className="mt-1 text-sm text-foreground">„{report.kommentar}“</p>
                  )}
                </div>
                <ReportedContentActions
                  reportId={report.id}
                  targetId={report.routeId}
                  type="route"
                  deleteConfirmDescription={`"${report.routeName}" wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.`}
                />
              </Card>
            ))}
            {ratingReports.map((report) => (
              <Card key={report.id} className="flex flex-col gap-3 p-4">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                    Kommentar gemeldet · {REPORT_REASON_LABEL[report.grund] ?? report.grund}
                  </p>
                  <Link
                    href={`/strecken/${report.routeId}`}
                    className="font-medium transition-colors duration-fast hover:text-accent"
                  >
                    {report.routeName}
                  </Link>
                  {report.ratingKommentar && (
                    <p className="mt-1 text-sm text-foreground">„{report.ratingKommentar}“</p>
                  )}
                  {report.kommentar && (
                    <p className="mt-1 text-sm text-muted">Meldungsgrund: „{report.kommentar}“</p>
                  )}
                </div>
                <ReportedContentActions
                  reportId={report.id}
                  targetId={report.ratingId}
                  type="rating"
                  deleteConfirmDescription="Der Kommentar wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden."
                />
              </Card>
            ))}
            {completionReports.map((report) => (
              <Card key={report.id} className="flex flex-col gap-3 p-4">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {report.istFreieFahrt ? "Freie Fahrt" : "Fahrt"} gemeldet ·{" "}
                    {REPORT_REASON_LABEL[report.grund] ?? report.grund}
                  </p>
                  <Link
                    href={`/fahrten/${report.completionId}`}
                    className="font-medium transition-colors duration-fast hover:text-accent"
                  >
                    {report.fahrtTitel}
                  </Link>
                  {report.fahrtNotiz && (
                    <p className="mt-1 text-sm text-foreground">„{report.fahrtNotiz}“</p>
                  )}
                  {report.kommentar && (
                    <p className="mt-1 text-sm text-muted">Meldungsgrund: „{report.kommentar}“</p>
                  )}
                </div>
                <ReportedContentActions
                  reportId={report.id}
                  targetId={report.completionId}
                  type="completion"
                  deleteConfirmDescription="Die Fahrt verschwindet aus Feed und öffentlichem Profil, inklusive ihrer Karte. Der Fahrer behält seine Aufzeichnung."
                />
              </Card>
            ))}
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
