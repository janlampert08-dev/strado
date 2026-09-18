"use client";

import { useActionState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import type { ReportState } from "@/lib/actions/reports";
import { REPORT_REASONS } from "@/lib/constants";
import Select from "@/components/ui/Select";

const initialState: ReportState = { error: null };

// Gemeinsamer Melde-Dialog für Strecken (RouteActionsMenu.tsx) und Kommentare
// (RatingSection.tsx) — nimmt die bereits per .bind(null, id) gebundene
// Server Action entgegen, damit dieselbe Dialog-/Formular-Logik nicht für
// jeden Inhaltstyp separat existiert.
export default function ReportDialog({
  open,
  onClose,
  title,
  action,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  action: (state: ReportState, formData: FormData) => Promise<ReportState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {state.success ? (
        <p className="text-sm text-muted">Danke, deine Meldung wurde übermittelt.</p>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Grund
            <Select name="grund" required defaultValue="">
              <option value="" disabled>
                Bitte auswählen
              </option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Kommentar (optional)
            <Textarea name="kommentar" rows={2} placeholder="Weitere Details für die Moderation" />
          </label>
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              {pending ? "Wird gesendet…" : "Melden"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
