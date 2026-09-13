"use client";

import { useState, useTransition } from "react";
import { markFeedbackErledigt } from "@/lib/actions/moderation";
import Button from "@/components/ui/Button";

// Eigene, schlanke Komponente statt einer vierten Variante in
// ReportedContentActions.tsx: dort gehören zu jedem Eintrag zwei Aktionen
// (ignorieren und eingreifen) plus ein Bestätigungsdialog. Eine Rückmeldung
// hat nur eine, und sie ist nicht gefährlich — ein Bestätigungsdialog wäre
// hier reine Reibung.
//
// Wie in ModerationActions.tsx/ReportedContentActions.tsx wird der Ausgang
// der Aktion angezeigt: ein Fehlschlag darf nicht als "erledigt" durchgehen.
export default function FeedbackActions({ feedbackId }: { feedbackId: string }) {
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={pending}
        onClick={() => {
          setFehler(null);
          startTransition(async () => {
            const { error } = await markFeedbackErledigt(feedbackId);
            setFehler(error);
          });
        }}
      >
        Erledigt
      </Button>
      {fehler && (
        <p role="alert" className="text-xs text-danger">
          {fehler}
        </p>
      )}
    </div>
  );
}
