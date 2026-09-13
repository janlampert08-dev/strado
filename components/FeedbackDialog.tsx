"use client";

import { useActionState, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea, fieldClassName } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { sendFeedback, type FeedbackState } from "@/lib/actions/feedback";
import { FEEDBACK_KATEGORIEN } from "@/lib/constants";
import { FEEDBACK_MAX_LENGTH } from "@/lib/feedback";

const initialState: FeedbackState = { error: null };

// Schaltfläche und Dialog in einer Komponente, weil die Einstellungsseite
// eine Server Component ist und den offen/zu-Zustand nicht halten kann —
// dasselbe Muster wie DeleteAccountSection.tsx.
//
// Bewusst KEINE Wiederverwendung von ReportDialog.tsx: der meldet fremde
// Inhalte an die Moderation, ist über eine gebundene Action pro Inhalt
// parametrisiert und trägt dessen Gründe-Liste. Hier geht es um eine
// Rückmeldung zur App selbst, ohne Bezugsobjekt.
export default function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  // Zählt die Öffnungen und dient als key des Formulars. useActionState
  // behält seinen letzten Zustand, solange die Komponente montiert bleibt —
  // ohne dieses Ummontieren stünde beim zweiten Öffnen noch der Dank von
  // vorhin im Dialog statt eines leeren Formulars.
  const [sitzung, setSitzung] = useState(0);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => {
          setSitzung((n) => n + 1);
          setOpen(true);
        }}
      >
        Feedback senden
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Feedback senden">
        <FeedbackFormular key={sitzung} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function FeedbackFormular({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(sendFeedback, initialState);
  const [laenge, setLaenge] = useState(0);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Danke! Deine Rückmeldung ist angekommen. Wir lesen jede einzelne — eine Antwort bekommst
          du aber nicht automatisch.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Schliessen
          </Button>
        </div>
      </div>
    );
  }

  const zuLang = laenge > FEEDBACK_MAX_LENGTH;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Worum geht es?
        <select name="kategorie" required defaultValue="" className={fieldClassName()}>
          <option value="" disabled>
            Bitte auswählen
          </option>
          {FEEDBACK_KATEGORIEN.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Deine Nachricht
        <Textarea
          name="nachricht"
          rows={5}
          required
          maxLength={FEEDBACK_MAX_LENGTH}
          invalid={zuLang}
          onChange={(event) => setLaenge(event.target.value.trim().length)}
          placeholder="Was ist passiert, was hast du erwartet — oder was würdest du dir wünschen?"
        />
      </label>
      {/* Der Zähler steht da, weil das Feld ein maxLength trägt: ohne ihn
          hörte das Tippen am Limit einfach auf, ohne dass jemand sagt warum.
          aria-live, damit auch ein Screenreader das Erreichen der Grenze
          mitbekommt. */}
      <p
        aria-live="polite"
        className={`text-right text-xs tabular-nums ${zuLang ? "text-danger" : "text-muted"}`}
      >
        {laenge} / {FEEDBACK_MAX_LENGTH}
      </p>
      <p className="text-xs text-muted">
        Wir sehen dazu dein Konto, damit wir bei Rückfragen wissen, wen wir fragen können.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Wird gesendet…" : "Senden"}
        </Button>
      </div>
    </form>
  );
}
