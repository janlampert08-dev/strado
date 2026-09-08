"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveRoute, rejectRoute } from "@/lib/actions/moderation";
import Button, { buttonVariants } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";

export default function ModerationActions({ routeId }: { routeId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Die Aktionen liefern seit dem Fehlerbericht in lib/actions/moderation.ts
  // ein Ergebnis statt void. Ohne diese Anzeige wäre ein fehlgeschlagenes
  // Freischalten von einem erfolgreichen nicht zu unterscheiden: die Seite
  // revalidiert in beiden Fällen, der Vorschlag bleibt im einen Fall stehen
  // und verschwindet im anderen — und "steht noch da" liest sich wie "der
  // Klick kam nicht an".
  const [fehler, setFehler] = useState<string | null>(null);

  function ausfuehren(aktion: () => Promise<{ error: string | null }>) {
    setFehler(null);
    startTransition(async () => {
      const { error } = await aktion();
      setFehler(error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => ausfuehren(() => approveRoute(routeId))}
          disabled={pending}
        >
          Freischalten
        </Button>
        {/* Start-/Zielort und Region werden bei "Strecke vorschlagen" per
            Reverse-Geocoding automatisch ermittelt (siehe proposeRoute()) —
            dieser Link führt zur bestehenden Moderations-Bearbeitung, falls
            ein Wert vor der Freigabe korrigiert werden muss. */}
        <Link href={`/strecken/${routeId}/bearbeiten`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Bearbeiten
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
        >
          Ablehnen
        </Button>
      </div>
      {fehler && (
        <p role="alert" className="text-xs text-danger">
          {fehler}
        </p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Vorschlag ablehnen"
        description="Der Vorschlag wird als abgelehnt markiert und ist für die Ersteller:in nicht mehr sichtbar veröffentlicht."
        confirmLabel="Ablehnen"
        variant="danger"
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          ausfuehren(() => rejectRoute(routeId));
        }}
      />
    </div>
  );
}
