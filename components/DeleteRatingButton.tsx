"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteRating } from "@/lib/actions/ratings";
import { ConfirmDialog } from "@/components/ui/Dialog";

// Gegenstück zum Melden-Knopf in RatingSection: dort meldet man fremde
// Kommentare, hier löscht man den eigenen. Gleiches Muster wie
// DeleteVehicleButton — Bestätigungsdialog, danach die Server Action in
// einer Transition, Fehler direkt am Knopf.
export default function DeleteRatingButton({ ratingId }: { ratingId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        aria-label="Kommentar löschen"
        className="text-muted transition-colors duration-fast hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        title="Kommentar löschen"
        description="Dein Kommentar wird dauerhaft von dieser Strecke entfernt."
        confirmLabel="Löschen"
        variant="danger"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          setError(null);
          startTransition(async () => {
            const result = await deleteRating(ratingId);
            if (result.error) setError(result.error);
          });
        }}
      />
    </div>
  );
}
