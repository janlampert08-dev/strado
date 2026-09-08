"use client";

import { useState, useTransition } from "react";
import {
  dismissRouteReport,
  dismissRatingReport,
  dismissCompletionReport,
  deleteReportedRoute,
  deleteReportedRating,
  unpublishReportedCompletion,
} from "@/lib/actions/moderation";
import Button from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";

// Drei Varianten in einer Komponente statt dreier Kopien — "Ignorieren" ist
// überall dasselbe, nur die aufgerufenen Server Actions und die Beschriftung
// der zweiten Schaltfläche unterscheiden sich.
//
// Bei einer gemeldeten Fahrt ist diese zweite Aktion bewusst kein Löschen,
// sondern das Entöffentlichen: eine persönliche Aufzeichnung soll dem Fahrer
// erhalten bleiben, sie muss nur aus der Öffentlichkeit verschwinden.
const ACTIONS = {
  route: { dismiss: dismissRouteReport, act: deleteReportedRoute, label: "Strecke löschen" },
  rating: { dismiss: dismissRatingReport, act: deleteReportedRating, label: "Kommentar löschen" },
  completion: {
    dismiss: dismissCompletionReport,
    act: unpublishReportedCompletion,
    label: "Fahrt verbergen",
  },
} as const;

export default function ReportedContentActions({
  reportId,
  targetId,
  type,
  deleteConfirmDescription,
}: {
  reportId: string;
  targetId: string;
  type: keyof typeof ACTIONS;
  deleteConfirmDescription: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Siehe ModerationActions.tsx: die Aktionen melden ihren Ausgang, ein
  // Fehlschlag darf nicht als "erledigt" durchgehen.
  const [fehler, setFehler] = useState<string | null>(null);

  const { dismiss, act: remove, label } = ACTIONS[type];

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
          variant="secondary"
          size="sm"
          onClick={() => ausfuehren(() => dismiss(reportId))}
          disabled={pending}
        >
          Ignorieren
        </Button>
        <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)} disabled={pending}>
          {label}
        </Button>
      </div>
      {fehler && (
        <p role="alert" className="text-xs text-danger">
          {fehler}
        </p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={label}
        description={deleteConfirmDescription}
        confirmLabel={type === "completion" ? "Verbergen" : "Löschen"}
        variant="danger"
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          ausfuehren(() => remove(targetId));
        }}
      />
    </div>
  );
}
