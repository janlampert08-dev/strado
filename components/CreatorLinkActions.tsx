"use client";

import { useState, useTransition } from "react";
import {
  creatorLinkAktivSetzen,
  creatorLinkLoeschen,
  type CreatorLinkResult,
} from "@/lib/actions/creatorLinks";
import Button from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";

// Aktionen an einem einzelnen Creator-Link. Wie ModerationActions.tsx: die
// Aktionen liefern ein Ergebnis statt void, und das wird angezeigt — sonst
// wäre ein von RLS abgelehnter Klick von einem erfolgreichen nicht zu
// unterscheiden, weil die Seite in beiden Fällen revalidiert.
export default function CreatorLinkActions({
  code,
  aktiv,
  name,
}: {
  code: string;
  aktiv: boolean;
  name: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  function ausfuehren(aktion: () => Promise<CreatorLinkResult>) {
    setFehler(null);
    startTransition(async () => {
      const { error } = await aktion();
      setFehler(error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => ausfuehren(() => creatorLinkAktivSetzen(code, !aktiv))}
        >
          {aktiv ? "Deaktivieren" : "Aktivieren"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        >
          Löschen
        </Button>
      </div>
      {fehler && (
        <p role="alert" className="text-xs text-danger">
          {fehler}
        </p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={`Link /c/${code} löschen`}
        description={`Der Code von ${name} wird endgültig entfernt. Wer ihn danach noch anklickt, landet ohne Zuordnung auf der Startseite. Wenn der Link schon verteilt ist, ist Deaktivieren das mildere Mittel — dann bleibt der Eintrag samt seiner Zahlen hier stehen.`}
        confirmLabel="Löschen"
        variant="danger"
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          ausfuehren(() => creatorLinkLoeschen(code));
        }}
      />
    </div>
  );
}
