"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { buildGoogleMapsUrl } from "@/lib/googleMaps";
import { buildGpx, gpxFileName } from "@/lib/gpx";
import { deleteRouteAsModerator } from "@/lib/actions/routes";
import { reportRoute } from "@/lib/actions/reports";
import type { RouteGeoJSON } from "@/types/database";
import Card from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Dialog";
import ReportDialog from "@/components/ReportDialog";

// Siehe components/PassStatusButton.tsx (Vorgänger dieser Komponente) für
// die Begründung: TCS pflegt eigene Seiten pro Pass, aber die genauen
// URL-Muster sind nicht für jeden Pass zuverlässig bekannt — ein falsch
// geratener Link wäre schlechter als der eine Klick über die (garantiert
// korrekte) Übersichtsseite.
const TCS_PORTAL_URL = "https://www.tcs.ch/de/tools/verkehrsinfo-verkehrslage/paesse-in-der-schweiz.php";

const ITEM_CLASS =
  "border-t border-border px-3 py-2 text-left text-sm text-foreground transition-colors duration-fast hover:bg-surface first:border-t-0";

export default function RouteActionsMenu({
  route,
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
   * zeichnet die Karte daraus, OfflineRouteButton bekommt dieselben
   * Koordinaten. Wer sie will, hat sie bereits.
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
  const [copied, setCopied] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const reportAction = reportRoute.bind(null, route.id);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleShare() {
    const url = `${window.location.origin}/strecken/${route.id}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: route.name, url });
      } catch {
        // Nutzer hat den Teilen-Dialog abgebrochen — kein Fehlerzustand nötig.
      }
      setOpen(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    } catch {
      setOpen(false);
    }
  }

  function handleGpxExport() {
    const blob = new Blob([buildGpx(route)], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gpxFileName(route.name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Weitere Aktionen"
        aria-expanded={open}
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors duration-fast hover:border-border-strong"
      >
        ⋮
      </button>
      {open && (
        <Card elevated as="div" className="absolute top-full left-0 z-10 mt-1 flex w-56 flex-col overflow-hidden">
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
          <button
            type="button"
            onClick={istPremium || isOwner ? handleGpxExport : undefined}
            disabled={!istPremium && !isOwner}
            title={
              istPremium || isOwner
                ? undefined
                : "GPX-Export kuratierter Strecken gehört zu Premium. Eigene Fahrten kannst du immer exportieren."
            }
            className={`${ITEM_CLASS} disabled:cursor-not-allowed disabled:text-muted`}
          >
            {istPremium || isOwner ? "GPX exportieren" : "GPX exportieren (Premium)"}
          </button>
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
