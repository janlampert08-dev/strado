"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";

// Zusätzlich zur RLS-Policy "Moderatoren können alle Strecken freischalten"
// (siehe 0009_profil_erweiterungen.sql) auch hier explizit prüfen
// (Defense-in-Depth) — sonst wäre eine künftige, versehentlich zu weit
// gefasste Policy (wie der Fahrzeuge-Bug in 0015) hier ohne jede
// Anwendungs-Sicherung ausnutzbar.
//
// Ablehnung löscht die Zeile nicht mehr (0011_route_ablehnung.sql), sondern
// setzt abgelehnt_am, damit der Ersteller den Status im eigenen Profil sieht.

// Jede Aktion hier gibt ihr Ergebnis zurück, statt void zu liefern.
//
// Vorher taten sie beides nicht: Weder wurde der Fehler der Datenbank
// betrachtet (`await supabase.from(...).update(...)` ohne Destrukturierung)
// noch konnte der Aufrufer etwas anderes tun als revalidieren. Ein
// fehlgeschlagenes Freischalten — abgelaufene Session, RLS-Verweigerung,
// Netzwerkfehler — sah für die Moderation exakt aus wie ein erfolgreiches:
// die Seite lud neu, der Vorschlag stand unverändert in der Warteschlange,
// und die einzig mögliche Deutung war "der Klick ist wohl nicht angekommen".
// In einer Protected Area ist ein stiller Fehlschlag der teuerste Ausgang.
//
// Ein Treffer von null Zeilen zählt dabei ausdrücklich als Fehler: RLS gibt
// bei fehlender Berechtigung keinen Fehler zurück, sondern filtert die Zeile
// aus dem UPDATE heraus. Ohne count wäre "darf nicht" von "hat geklappt"
// nicht zu unterscheiden — genau die Verwechslung, gegen die die
// isModerator-Prüfung oben als zweite Schranke steht.
export interface ModerationResult {
  error: string | null;
}

const OK: ModerationResult = { error: null };
const NICHT_BERECHTIGT: ModerationResult = {
  error: "Dafür fehlt dir die Berechtigung. Bitte lade die Seite neu.",
};

function fehlgeschlagen(was: string): ModerationResult {
  return { error: `${was} hat nicht geklappt. Bitte versuche es noch einmal.` };
}

// Der gemeinsame Kopf jeder Aktion: Session prüfen, Moderatorenrolle prüfen.
// Liefert die user_id, die für bearbeitet_von gebraucht wird, oder das
// fertige Fehlerergebnis.
async function alsModerator(): Promise<
  { userId: string; supabase: Awaited<ReturnType<typeof createClient>> } | ModerationResult
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isModerator(user.id))) return NICHT_BERECHTIGT;
  return { userId: user.id, supabase };
}

export async function approveRoute(routeId: string): Promise<ModerationResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const { error, count } = await kontext.supabase
    .from("routes")
    .update({ status_ok: true, abgelehnt_am: null }, { count: "exact" })
    .eq("id", routeId);

  if (error || count === 0) return fehlgeschlagen("Das Freischalten");

  revalidatePath("/moderation");
  revalidatePath("/");
  revalidatePath("/profil");
  return OK;
}

export async function rejectRoute(routeId: string): Promise<ModerationResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const { error, count } = await kontext.supabase
    .from("routes")
    .update(
      { status_ok: false, abgelehnt_am: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("id", routeId);

  if (error || count === 0) return fehlgeschlagen("Das Ablehnen");

  revalidatePath("/moderation");
  revalidatePath("/");
  revalidatePath("/profil");
  return OK;
}

// Meldungen (route_reports/rating_reports, siehe 0043_content_reports.sql)
// — Nutzer melden Strecken/Kommentare über lib/actions/reports.ts, hier
// folgen nur die moderator-seitigen Aktionen darauf.

export async function dismissRouteReport(reportId: string): Promise<ModerationResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const { error, count } = await kontext.supabase
    .from("route_reports")
    .update(
      {
        status: "erledigt",
        bearbeitet_am: new Date().toISOString(),
        bearbeitet_von: kontext.userId,
      },
      { count: "exact" },
    )
    .eq("id", reportId);

  if (error || count === 0) return fehlgeschlagen("Das Ignorieren der Meldung");

  revalidatePath("/moderation");
  return OK;
}

export async function dismissRatingReport(reportId: string): Promise<ModerationResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const { error, count } = await kontext.supabase
    .from("rating_reports")
    .update(
      {
        status: "erledigt",
        bearbeitet_am: new Date().toISOString(),
        bearbeitet_von: kontext.userId,
      },
      { count: "exact" },
    )
    .eq("id", reportId);

  if (error || count === 0) return fehlgeschlagen("Das Ignorieren der Meldung");

  revalidatePath("/moderation");
  return OK;
}

// Löscht die gemeldete Strecke direkt aus der Moderationswarteschlange
// heraus. Bewusst eine eigene, schlanke Funktion statt deleteRouteAsModerator
// (lib/actions/routes.ts) wiederzuverwenden — jene ist für den
// Streckendetail-Kontext gedacht und redirected nach "/", hier soll die
// Moderationsseite bestehen bleiben. Offene Meldungen zu dieser Strecke
// verschwinden automatisch per FK-Cascade (route_reports.route_id →
// routes.id on delete cascade, 0043).
export async function deleteReportedRoute(routeId: string): Promise<ModerationResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const { error, count } = await kontext.supabase
    .from("routes")
    .delete({ count: "exact" })
    .eq("id", routeId);

  if (error || count === 0) return fehlgeschlagen("Das Löschen der Strecke");

  revalidatePath("/moderation");
  revalidatePath("/");
  return OK;
}

// Wie deleteReportedRoute, aber für eine gemeldete Bewertung/einen
// gemeldeten Kommentar — verlässt sich auf die neue RLS-Policy "Moderatoren
// können Bewertungen löschen" (0043). Cascade (rating_reports.rating_id →
// route_ratings.id on delete cascade) räumt zugehörige offene Meldungen
// automatisch mit auf.
export async function deleteReportedRating(ratingId: string): Promise<ModerationResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const { data: rating } = await kontext.supabase
    .from("route_ratings")
    .select("route_id")
    .eq("id", ratingId)
    .maybeSingle();

  const { error, count } = await kontext.supabase
    .from("route_ratings")
    .delete({ count: "exact" })
    .eq("id", ratingId);

  if (error || count === 0) return fehlgeschlagen("Das Löschen des Kommentars");

  revalidatePath("/moderation");
  if (rating) revalidatePath(`/strecken/${rating.route_id}`);
  return OK;
}

export async function dismissCompletionReport(reportId: string): Promise<ModerationResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const { error, count } = await kontext.supabase
    .from("completion_reports")
    .update(
      {
        status: "erledigt",
        bearbeitet_am: new Date().toISOString(),
        bearbeitet_von: kontext.userId,
      },
      { count: "exact" },
    )
    .eq("id", reportId);

  if (error || count === 0) return fehlgeschlagen("Das Ignorieren der Meldung");

  revalidatePath("/moderation");
  return OK;
}

// Nimmt eine gemeldete Fahrt aus der Öffentlichkeit, statt sie zu löschen —
// das mildeste wirksame Mittel: der Fahrer behält seine Aufzeichnung, sie
// verschwindet nur aus Feed und öffentlichem Profil. Der gekappte
// öffentliche Track wird dabei mit entfernt, damit keine Geometrie einer
// nicht mehr sichtbaren Fahrt zurückbleibt (siehe 0045).
//
// Möglich wird das über die Moderator-Policy aus 0046_fahrt_meldungen.sql;
// die Spalten-Grants derselben Migration begrenzen, was dabei überhaupt
// geändert werden kann.
export async function unpublishReportedCompletion(
  completionId: string,
): Promise<ModerationResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const { error, count } = await kontext.supabase
    .from("route_completions")
    .update({ ist_oeffentlich: false, track_oeffentlich: null }, { count: "exact" })
    .eq("id", completionId);

  if (error || count === 0) return fehlgeschlagen("Das Verbergen der Fahrt");

  // Offene Meldungen zu dieser Fahrt sind damit erledigt — sonst bliebe die
  // Warteschlange voll mit Fahrten, um die sich schon jemand gekümmert hat.
  // Ein Fehler hier ist nachrangig: die Fahrt IST bereits verborgen, das
  // eigentliche Ziel der Aktion ist erreicht. Ihn als Fehlschlag zu melden
  // würde die Moderation zu einem zweiten Klick verleiten, der nichts mehr
  // ändert. Kein count-Check aus demselben Grund — null offene Meldungen
  // sind hier ein zulässiger Normalfall.
  const { error: meldungsFehler } = await kontext.supabase
    .from("completion_reports")
    .update({
      status: "erledigt",
      bearbeitet_am: new Date().toISOString(),
      bearbeitet_von: kontext.userId,
    })
    .eq("completion_id", completionId)
    .eq("status", "offen");

  if (meldungsFehler) {
    console.error("Meldungen zur verborgenen Fahrt nicht geschlossen", { completionId }, meldungsFehler);
  }

  revalidatePath("/moderation");
  revalidatePath("/feed");
  revalidatePath(`/fahrten/${completionId}`);
  return OK;
}
