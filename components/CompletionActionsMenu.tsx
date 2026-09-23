"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import {
  deleteCompletion,
  toggleCompletionVisibility,
  updateCompletionNotiz,
} from "@/lib/actions/completions";
import { GlobeIcon, LockIcon } from "@/components/VisibilityIcons";
import { COVERAGE_THRESHOLD_PERCENT } from "@/lib/routeCoverage";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";
import { Dialog } from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";

const ITEM_CLASS =
  "border-t border-border px-3 py-2 text-left text-sm text-foreground transition-colors duration-fast hover:bg-surface druckbar first:border-t-0 disabled:pointer-events-none disabled:opacity-50";

const MAX_NOTIZ_LENGTH = 280;

// 3-Punkte-Menü auf der Fahrt-Detailseite (app/fahrten/[id]/page.tsx),
// ersetzt die vorherige statische "Nur für dich sichtbar"-Card — nur für den
// Besitzer gerendert. Gleiches Grundmuster wie RouteActionsMenu.tsx
// (Klick-ausserhalb schliesst, Card elevated als Dropdown-Panel).
export default function CompletionActionsMenu({
  completionId,
  isPublic,
  coveragePercent,
  blockedReason = null,
  notiz,
}: {
  completionId: string;
  isPublic: boolean;
  coveragePercent: number | null;
  blockedReason?: string | null;
  notiz: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notizDraft, setNotizDraft] = useState(notiz ?? "");
  const [toggling, startToggle] = useTransition();
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ausloeserRef = useRef<HTMLButtonElement>(null);

  const belowThreshold =
    coveragePercent !== null && coveragePercent < COVERAGE_THRESHOLD_PERCENT;
  // Gesperrt wird je nach Fahrtart über den Deckungsgrad (Strecke) oder die
  // Mindestwerte fürs Teilen (freie Fahrt, siehe publicationBlockReason).
  const toggleBlocked = !isPublic && (belowThreshold || blockedReason !== null);

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
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
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

  function handleToggleVisibility() {
    schliessenUndFokusZurueck();
    startToggle(async () => {
      const result = await toggleCompletionVisibility(completionId);
      setError(result.error);
    });
  }

  function handleDelete() {
    setError(null);
    startDelete(async () => {
      const result = await deleteCompletion(completionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.push("/profil");
    });
  }

  function handleSaveNotiz() {
    startSave(async () => {
      const result = await updateCompletionNotiz(completionId, notizDraft);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditOpen(false);
    });
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <IconButton
        ref={ausloeserRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Weitere Aktionen"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      {open && (
        <Card elevated as="div" className="absolute top-full right-0 z-10 mt-1 flex w-60 flex-col overflow-hidden">
          <button
            type="button"
            onClick={handleToggleVisibility}
            disabled={toggling || toggleBlocked}
            title={
              toggleBlocked
                ? (blockedReason ??
                  `Kann nicht öffentlich gemacht werden — deckt nur ${Math.round(coveragePercent ?? 0)}% der Strecke ab.`)
                : undefined
            }
            className={`${ITEM_CLASS} flex items-center gap-1.5`}
          >
            {/* Icon zeigt den aktuellen Sichtbarkeitsstatus — dieselbe
                Globus/Schloss-Zuordnung wie RideVisibilityToggle,
                LiveTrackingForm und NeueStreckeForm, statt hier eine reine
                Textzeile ohne visuellen Anker zu bleiben. */}
            {isPublic ? (
              <GlobeIcon className="h-4 w-4 text-muted" aria-hidden="true" />
            ) : (
              <LockIcon className="h-4 w-4 text-muted" aria-hidden="true" />
            )}
            {isPublic ? "Privat machen" : "Öffentlich teilen"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setNotizDraft(notiz ?? "");
              setEditOpen(true);
            }}
            className={ITEM_CLASS}
          >
            Beschreibung bearbeiten
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setDeleteOpen(true);
            }}
            className={`${ITEM_CLASS} flex items-center gap-1.5 text-danger`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Fahrt löschen
          </button>
        </Card>
      )}
      {error && (
        <Card
          elevated
          className="absolute top-full right-0 z-10 mt-1 w-60 p-2 text-right text-xs text-danger"
        >
          {error}
        </Card>
      )}

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Fahrt löschen">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Die Aufzeichnung wird mit allen Fotos, Kudos und der gespeicherten Fahrtspur
            endgültig gelöscht. Das lässt sich nicht rückgängig machen.
          </p>
          {/* Der Fehlertext muss hier stehen und nicht in der Card unten:
              der Dialog ist ein natives <dialog> mit showModal() und liegt
              damit im Top-Layer über allem anderen — eine Meldung ausserhalb
              wäre unsichtbar, während der Dialog offen bleibt. */}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
              Abbrechen
            </Button>
            <Button type="button" variant="danger" size="sm" disabled={deleting} onClick={handleDelete}>
              {deleting ? "Löschen…" : "Endgültig löschen"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Beschreibung bearbeiten">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <SectionHeading as="label" groesse="xs" htmlFor="notiz-edit">
              Notiz
            </SectionHeading>
            <span className="text-xs tabular-nums text-muted">
              {notizDraft.length}/{MAX_NOTIZ_LENGTH}
            </span>
          </div>
          <textarea
            id="notiz-edit"
            rows={3}
            maxLength={MAX_NOTIZ_LENGTH}
            value={notizDraft}
            onChange={(e) => setNotizDraft(e.target.value)}
            placeholder="z. B. nasse Fahrbahn, mit der Ducati…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground transition-shadow duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent md:text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditOpen(false)}>
              Abbrechen
            </Button>
            <Button type="button" variant="primary" size="sm" disabled={saving} onClick={handleSaveNotiz}>
              {saving ? "Wird gespeichert…" : "Speichern"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
