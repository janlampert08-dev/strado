"use client";

import { useActionState } from "react";
import { passStatusSetzen, type ModerationResult } from "@/lib/actions/moderation";
import { Input, fieldClassName } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import {
  PASS_HINWEIS_MAX,
  PASS_QUELLE_MAX,
  PASS_STATUS_LABEL,
  PASS_STATUS_WERTE,
  type PassStatus,
} from "@/lib/passStatus";

const initialState: ModerationResult = { error: null };

// Das Moderationsformular für einen einzelnen Pass (0112).
//
// Bewusst klein gehalten: vier Felder, ein Knopf, kein Dialog und kein
// eigener Navigationspunkt (docs/premium-ausbau-plan.md §1 — jedes Feature
// bekommt genau einen Ort, und dieser Ort existiert bereits). Jedes
// Speichern zählt als Prüfung; das Prüfdatum setzt der Trigger in der
// Datenbank, es gibt hier also kein Feld dafür.
//
// <select> mit fieldClassName statt einer eigenen Komponente — dasselbe
// Muster wie FeedbackDialog und NeuesFahrzeugForm.
export default function PassStatusForm({
  routeId,
  status,
}: {
  routeId: string;
  status: PassStatus | null;
}) {
  const [state, formAction, pending] = useActionState(passStatusSetzen, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="route_id" value={routeId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select
            name="status"
            required
            defaultValue={status?.status ?? ""}
            className={fieldClassName()}
          >
            <option value="" disabled>
              Bitte wählen
            </option>
            {PASS_STATUS_WERTE.map((wert) => (
              <option key={wert} value={wert}>
                {PASS_STATUS_LABEL[wert]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Voraussichtlich offen ab <span className="font-normal text-muted">(optional)</span>
          <Input
            type="date"
            name="voraussichtlich_offen_ab"
            defaultValue={status?.voraussichtlich_offen_ab ?? ""}
          />
          <span className="text-xs font-normal text-muted">
            Nur bei gesperrtem Pass — bei „Offen“ wird es verworfen.
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Hinweis <span className="font-normal text-muted">(optional)</span>
          <Input
            type="text"
            name="hinweis"
            maxLength={PASS_HINWEIS_MAX}
            defaultValue={status?.hinweis ?? ""}
            placeholder="Nachtsperre 22–6 Uhr"
            autoComplete="off"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Quelle <span className="font-normal text-muted">(optional)</span>
          <Input
            type="text"
            name="quelle"
            maxLength={PASS_QUELLE_MAX}
            defaultValue={status?.quelle ?? ""}
            placeholder="TCS"
            autoComplete="off"
          />
          <span className="text-xs font-normal text-muted">Steht auf der Streckenseite.</span>
        </label>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Wird gespeichert…" : "Status speichern"}
        </Button>
      </div>
    </form>
  );
}
