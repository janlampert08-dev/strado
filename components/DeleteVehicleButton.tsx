"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteVehicle } from "@/lib/actions/vehicles";
import { ConfirmDialog } from "@/components/ui/Dialog";

export default function DeleteVehicleButton({
  vehicleId,
  nachLoeschenHref,
}: {
  vehicleId: string;
  /**
   * Wohin nach dem Löschen. Gesetzt auf der Fahrzeugseite
   * (app/profil/fahrzeuge/[id]): stehenzubleiben hiesse, die Detailseite
   * eines Fahrzeugs zu zeigen, das es nicht mehr gibt. Ohne die Angabe
   * bleibt die Seite stehen — so verhält sich der Knopf dort, wo er in
   * einer Liste sitzt.
   */
  nachLoeschenHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="rounded-md px-3 py-2 text-xs text-muted transition-colors duration-fast hover:text-foreground disabled:opacity-50"
      >
        {pending ? "Wird entfernt…" : "Entfernen"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        title="Fahrzeug entfernen"
        description="Das Fahrzeug wird dauerhaft aus deinem Profil entfernt."
        confirmLabel="Entfernen"
        variant="danger"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          setError(null);
          startTransition(async () => {
            const result = await deleteVehicle(vehicleId);
            if (result.error) {
              setError(result.error);
              return;
            }
            // replace statt push: das gelöschte Fahrzeug soll nicht im
            // Verlauf liegen und über "Zurück" wieder als 404 erscheinen.
            if (nachLoeschenHref) router.replace(nachLoeschenHref);
          });
        }}
      />
    </div>
  );
}
