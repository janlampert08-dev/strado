"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal } from "@/components/NavIcons";
import { buildGoogleMapsUrl } from "@/lib/googleMaps";
import { buildGpx, gpxFileName } from "@/lib/gpx";
import { deleteRouteAsModerator } from "@/lib/actions/routes";
import { reportRoute } from "@/lib/actions/reports";
import type { RouteGeoJSON } from "@/types/database";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/Dialog";
import ReportDialog from "@/components/ReportDialog";
import { useVolleGeometrie } from "@/components/VolleGeometrie";
import { TCS_PASS_PORTAL_URL } from "@/lib/constants";

// Die Adresse steht in lib/constants.ts, weil die Moderation dieselbe Seite
// verlinkt (components/PassStatusForm.tsx) — die Begründung für die
// Übersichtsseite statt eines Links pro Pass steht dort im Kommentar.
const TCS_PORTAL_URL = TCS_PASS_PORTAL_URL;

// min-h-11: jeder Eintrag ist eine Tippfläche (44 px, siehe ui/IconButton).
// Mit py-2 allein waren es rund 36 px.
const ITEM_CLASS =
  "flex min-h-11 items-center border-t border-border px-3 py-2 text-left text-sm text-foreground transition-colors duration-fast hover:bg-surface druckbar first:border-t-0";

export default function RouteActionsMenu({
  route: hereingereicht,
  moderator = false,
  isOwner = false,
  canReport = false,
  istPremium = false,
}: {
  route: RouteGeoJSON;
  moderator?: boolean;
  isOwner?: boolean;
  /** Angemeldet und nicht der Ersteller selbst — siehe app/strecken/[id]/page.tsx. */
  canReport?: boolean;
  /**
   * Der GPX-Export kuratierter Strecken gehört zum Abo (AGB Ziff. 3.2).
   * Eigene Fahrten lassen sich unabhängig davon immer exportieren — das ist
   * Datenherausgabe nach Art. 28 DSG und darf nichts kosten.
   *
   * ACHTUNG, und das ist keine Nachlässigkeit, sondern die Lage: das hier
   * ist eine BEQUEMLICHKEITSSCHRANKE, keine Zugriffsschranke. Die
   * Streckengeometrie liegt ohnehin vollständig im Browser — RouteDetailMap
   * lädt sie für die Karte nach (app/strecken/[id]/geometrie, seit
   * 2026-09-23 nicht mehr in der Seite selbst), OfflineRouteButton speichert
   * dieselben Koordinaten. Wer sie will, hat sie bereits.
   *
   * Ein serverseitiger GPX-Endpunkt würde daran nichts ändern und wäre
   * blosses Theater: er müsste Daten schützen, die die Seite eine Zeile
   * weiter oben selbst ausliefert. Echt verschliessen liesse sich das nur,
   * indem auch die Karte verschwindet — und die Karte ist das Produkt.
   *
   * Deshalb wird hier nichts vorgetäuscht: Premium spart den Umweg, nicht
   * den Zugang. Wo das Feature beworben wird, muss es genauso stehen.
   */
  istPremium?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Wo das Menü aufgeht, in Bildschirmkoordinaten (position: fixed).
  //
  // Vorher hing es absolut unter dem Auslöser. Auf der Streckenseite liegt
  // der Auslöser aber im DragSheet, und das Sheet schneidet mit
  // overflow-hidden alles ab, was über seinen Rand ragt — in halber Höhe war
  // vom Menü nur der erste Eintrag zu sehen. fixed entkommt dem Zuschnitt
  // (das Sheet trägt kein transform, das einen neuen Bezugsrahmen bilden
  // würde), und ist unten zu wenig Platz, geht es nach oben auf.
  const [lage, setLage] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight?: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Der Premium-Hinweis zum GPX-Export — erscheint erst beim Antippen,
  // nicht als Dauerzustand am Eintrag (siehe unten).
  const [gpxHinweis, setGpxHinweis] = useState(false);
  // Die Seite reicht die Übersichtslinie herein (0117); Google-Maps-Link und
  // GPX nehmen die volle, sobald sie da ist. Für den Export wird notfalls
  // darauf gewartet — ein GPX aus der Übersicht schnitte Kehren um bis zu
  // 50 m ab, und nach so einer Datei navigiert jemand.
  const { strecke: route, stand: linienStand, laden: volleStreckeLaden } =
    useVolleGeometrie(hereingereicht);
  const [gpxFehler, setGpxFehler] = useState(false);
  const [deleting, startDelete] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const ausloeserRef = useRef<HTMLButtonElement>(null);
  const reportAction = reportRoute.bind(null, route.id);

  // Wie viele Zeilen das Menue bekommt, haengt von Rolle und Strecke ab: drei
  // feste (Teilen, Google Maps, GPX), dazu je eine fuer einen saisonalen Pass,
  // fuer die eigene Strecke und fuer "Melden", dazu zwei fuer die Moderation.
  // Drei bis sieben also — vorher rechnete die Hoehenschaetzung fest mit
  // fuenf. Bei sieben (eine Moderatorin auf einer fremden saisonalen Strecke)
  // unterschaetzte sie das Menue um rund 90 px, es ging nach unten auf, wo es
  // nicht hinpasst, und weil die Karte `fixed` liegt, war der abgeschnittene
  // Teil nicht wegscrollbar: "Melden" und "Strecke loeschen" waren nicht
  // erreichbar.
  const menueEintraege =
    3 +
    (route.saison_status === "saisonal" ? 1 : 0) +
    (isOwner ? 1 : 0) +
    (canReport ? 1 : 0) +
    (moderator ? 2 : 0);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    // Escape schliesst mit. Bisher ging das Menü nur per Klick daneben wieder
    // zu — auf der Tastatur gab es also keinen Weg heraus, und für alle
    // anderen blieb es offen stehen und fing Klicks auf den darunter
    // liegenden Knöpfen ab. Die Melde-Dialoge derselben Seiten sind native
    // <dialog>-Elemente und schliessen mit Escape von sich aus; das Menü war
    // die einzige Überlagerung der App, die es nicht tat.
    //
    // Der Fokus geht dabei auf den Auslöser zurück: lag er auf einem Eintrag,
    // verschwindet dieser mit dem Menü aus dem Dokument, und ohne
    // Rückgabe landete er beim <body> — die Tastaturposition wäre verloren.
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Schliessen gilt global — ein offen stehengebliebenes Menü soll zugehen,
      // egal wo der Fokus gerade liegt. Dass der Fokus nur dann zurückgeholt
      // wird, wenn er auch hier drin liegt, erledigt der Helfer: Tab schliesst
      // das Menü nicht, wer also daran vorbeitabbt und weiter unten in einem
      // Textfeld Escape drückt (ein Autofill-Vorschlag ist der häufigste
      // Anlass), bekäme den Fokus sonst an den Auslöser weiter oben gerissen.
      schliessenUndFokusZurueck();
    }
    // Die Karte liegt `fixed` und behaelt die Bildschirmkoordinaten, die beim
    // Oeffnen ausgerechnet wurden. Scrollt danach etwas — auf der
    // Streckenseite scrollt das DragSheet, in dem der Ausloeser sitzt —,
    // bleibt das Menue stehen, waehrend der Ausloeser darunter wegwandert:
    // eine Ueberlagerung ohne sichtbaren Bezug, die Klicks auf das abfaengt,
    // was inzwischen darunter liegt. Deshalb schliesst es mit. Das ist die
    // uebliche Antwort fuer ein verankertes Menue und billiger als eine
    // Neuberechnung pro Frame, die beim Ziehen des Sheets dauernd liefe.
    //
    // capture: true, weil das Sheet selbst der scrollende Kasten ist und ein
    // scroll-Ereignis eines Elements nicht bis zum document blubbert.
    function handleScroll(e: Event) {
      // Das Menue selbst darf scrollen, ohne sich dabei zu schliessen: passt
      // es in keine Richtung ganz, begrenzt die Hoehe es und der Rest wird
      // gescrollt (overflow-y-auto). Dieses Ereignis kommt aus dem Menue und
      // ist kein Wegwandern des Ausloesers.
      if (e.target instanceof Node && containerRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open]);

  // Menü schliessen und den Fokus auf den Auslöser zurücksetzen — aber nur,
  // wenn er zu diesem Zeitpunkt noch in der Komponente liegt.
  //
  // Der Eintrag selbst verschwindet mit dem Menü aus dem DOM; ohne Rückgabe
  // fällt der Fokus auf <body>, und der nächste Tab fängt wieder am
  // Seitenanfang an. Einträge, die danach einen Dialog öffnen, brauchen das
  // nicht — components/ui/Dialog.tsx setzt den Fokus über showModal() ohnehin
  // um, und eine zweite Zuweisung würde ihm dort nur zuvorkommen.
  //
  // Die Bedingung ist nicht Vorsicht, sondern nötig: der Zwischenablage-Zweig
  // ruft das erst 1200 ms später aus einem Timer. In dieser Sekunde kann der
  // Nutzer längst woanders geklickt oder getabbt haben — eine bedingungslose
  // Rückgabe wäre dann derselbe Fokusdiebstahl, den der Escape-Zweig
  // vermeidet, nur zeitversetzt und schwerer zu sehen.
  //
  // Geprüft wird VOR dem Schliessen, solange der ausgelöste Eintrag noch im
  // Dokument hängt; danach stünde document.activeElement längst auf <body>.
  function schliessenUndFokusZurueck() {
    const fokusIstDrin =
      containerRef.current?.contains(document.activeElement) ?? false;
    setOpen(false);
    if (fokusIstDrin) ausloeserRef.current?.focus();
  }

  async function handleShare() {
    const url = `${window.location.origin}/strecken/${route.id}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: route.name, url });
      } catch {
        // Nutzer hat den Teilen-Dialog abgebrochen — kein Fehlerzustand nötig.
      }
      schliessenUndFokusZurueck();
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        schliessenUndFokusZurueck();
      }, 1200);
    } catch {
      schliessenUndFokusZurueck();
    }
  }

  async function handleGpxExport() {
    setGpxFehler(false);
    let quelle = route;
    if (linienStand === "laedt" || linienStand === "fehlgeschlagen") {
      try {
        quelle = await volleStreckeLaden();
      } catch {
        setGpxFehler(true);
        return;
      }
    }
    const blob = new Blob([buildGpx(quelle)], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gpxFileName(route.name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    schliessenUndFokusZurueck();
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Vorher ein "⋮" als Textzeichen in einem rounded-lg-Rahmen. Zwei
          Probleme: die Plattformschrift rendert es auf jedem Gerät anders
          breit und schwer, und CompletionActionsMenu zeichnete denselben
          Auslöser als Lucide-Icon — eine Handlung, zwei Bildsprachen. */}
      <IconButton
        ref={ausloeserRef}
        onClick={() => {
          const rect = ausloeserRef.current?.getBoundingClientRect();
          if (rect) {
            // 44 px Tippflaeche plus 1 px Trennlinie je Eintrag, plus Luft.
            const menuHoehe = menueEintraege * 45 + 8;
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - 224 - 8));
            // 4 px Abstand zum Ausloeser, 8 px zum Bildschirmrand.
            const platzUnten = window.innerHeight - rect.bottom - 12;
            const platzOben = rect.top - 12;
            // Passt es unten, geht es nach unten auf. Passt es dort nicht,
            // gewinnt die Seite mit mehr Platz — vorher klappte es blind nach
            // oben, auch wenn dort noch weniger Raum war. Und damit ein Menue,
            // das in keine Richtung ganz passt, trotzdem bedienbar bleibt,
            // wird die Hoehe auf den vorhandenen Platz begrenzt; der Rest ist
            // dann scrollbar statt abgeschnitten (siehe overflow-y-auto unten).
            const nachUnten = platzUnten >= menuHoehe || platzUnten >= platzOben;
            setLage({
              left,
              ...(nachUnten
                ? { top: rect.bottom + 4 }
                : { bottom: window.innerHeight - rect.top + 4 }),
              maxHeight: Math.max(120, nachUnten ? platzUnten : platzOben),
            });
          }
          setOpen((v) => !v);
          setGpxHinweis(false);
          setGpxFehler(false);
        }}
        aria-label="Weitere Aktionen"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      {open && (
        <Card
          elevated
          as="div"
          className="fixed z-50 flex w-56 flex-col overflow-y-auto"
          style={lage ?? undefined}
        >
          <button type="button" onClick={handleShare} className={ITEM_CLASS}>
            {copied ? "Link kopiert ✓" : "Teilen"}
          </button>
          <a
            href={buildGoogleMapsUrl(route)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={ITEM_CLASS}
          >
            In Google Maps öffnen ↗
          </a>
          {/* Der Eintrag bleibt BEDIENBAR, auch ohne Abo — und heisst nicht
              "(Premium)". Vorher stand hier ein dauerhaft deaktivierter
              Eintrag mit dem Wort im Namen: ein Schloss auf jeder
              Streckenseite, für jedes Gratis-Konto, immer, auch wenn nie
              jemand exportieren wollte. Ein Schloss an einer Stelle, an der
              vorher nichts war, liest sich als Wegnahme — genau das, was das
              additive Gating aus docs/premium-plan.md vermeiden soll.

              Jetzt erscheint die Erklärung erst beim Antippen: ein Tipper
              mehr für Gratis-Konten, dafür null dauerhafte Unruhe für alle.
              Der Export selbst bleibt gesperrt — es wird nichts freigegeben,
              nur der Zeitpunkt der Erklärung verschoben.
              Siehe docs/design-vereinfachung.md, Anhang C2. */}
          <button
            type="button"
            onClick={istPremium || isOwner ? handleGpxExport : () => setGpxHinweis(true)}
            className={ITEM_CLASS}
          >
            GPX exportieren
          </button>
          {gpxFehler && (
            <p role="status" className="border-t border-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-muted">
              Die Streckenlinie liess sich gerade nicht laden. Versuch es mit Empfang noch einmal.
            </p>
          )}
          {gpxHinweis && (
            <div className="flex flex-col gap-2 border-t border-border bg-surface px-3 py-2.5">
              <p className="text-sm leading-relaxed text-muted">
                Kuratierte Strecken als GPX gehören zu Premium. Deine eigenen Fahrten kannst du
                immer exportieren.
              </p>
              <Link
                href="/profil/premium"
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-accent hover:underline"
              >
                Mehr zu Premium →
              </Link>
            </div>
          )}
          {route.saison_status === "saisonal" && (
            <a
              href={TCS_PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={ITEM_CLASS}
            >
              Live-Passstatus (TCS) ↗
            </a>
          )}
          {isOwner && (
            <Link
              href={`/strecken/${route.id}/bearbeiten`}
              onClick={() => setOpen(false)}
              className={ITEM_CLASS}
            >
              Bearbeiten
            </Link>
          )}
          {canReport && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setReportOpen(true);
              }}
              className={`${ITEM_CLASS} text-danger`}
            >
              Melden
            </button>
          )}
          {moderator && (
            <>
              <Link
                href={`/strecken/${route.id}/bearbeiten`}
                onClick={() => setOpen(false)}
                className={ITEM_CLASS}
              >
                Bearbeiten (Moderation)
              </Link>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDeleteConfirmOpen(true);
                }}
                disabled={deleting}
                className={`${ITEM_CLASS} text-danger disabled:opacity-50`}
              >
                {deleting ? "Wird gelöscht…" : "Strecke löschen"}
              </button>
            </>
          )}
        </Card>
      )}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Strecke löschen"
        description={`"${route.name}" wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        variant="danger"
        pending={deleting}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          startDelete(() => deleteRouteAsModerator(route.id));
        }}
      />
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Strecke melden"
        action={reportAction}
      />
    </div>
  );
}
