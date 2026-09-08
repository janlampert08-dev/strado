"use client";

import { useState, useTransition } from "react";
import { deleteOwnRejectedRoute } from "@/lib/actions/routes";
import { ConfirmDialog } from "@/components/ui/Dialog";

export default function DeleteProposalButton({ routeId }: { routeId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="rounded-md px-3 py-2 text-xs text-muted transition-colors duration-fast hover:text-danger disabled:opacity-50"
      >
        {pending ? "Wird gelöscht…" : "Löschen"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        title="Strecke löschen"
        description="Die abgelehnte Strecke wird endgültig gelöscht."
        confirmLabel="Löschen"
        variant="danger"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          setError(null);
          startTransition(async () => {
            const result = await deleteOwnRejectedRoute(routeId);
            if (result.error) setError(result.error);
          });
        }}
      />
    </div>
  );
}
