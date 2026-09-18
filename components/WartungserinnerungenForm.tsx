"use client";

import { useActionState, useRef } from "react";
import useEingabenBewahren from "@/components/useEingabenBewahren";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  speichereWartungserinnerungen,
  type WartungFormState,
} from "@/lib/actions/wartung";
import {
  MAX_INTERVALL_KM,
  MAX_INTERVALL_MONATE,
  MFK_MAX_JAHRE_VORAUS,
  MIN_INTERVALL_KM,
  MIN_INTERVALL_MONATE,
  plusJahre,
} from "@/lib/wartung";
import type { Wartungserinnerung } from "@/types/database";

// Die Erinnerungseinstellungen eines Fahrzeugs: MFK-Termin und
// Serviceintervall. Drei Felder, alle freiwillig — leer heisst "nicht
// erinnern", und dann verschwindet die Zeile auch aus der Datenbank
// (lib/actions/wartung.ts).
//
// Kein Dialog, sondern ein Formular an seinem Platz: es wird selten
// geöffnet, aber wenn, dann zum Nachschauen ("wann war das nochmal?"), und
// ein Dialog würde das Nachschauen hinter einen Klick legen.

const LEERER_ZUSTAND: WartungFormState = { error: null };

export default function WartungserinnerungenForm({
  fahrzeugId,
  heute,
  erinnerungen,
}: {
  fahrzeugId: string;
  /** Kalendertag in Europe/Zurich, vom Server — Grundlage der Obergrenze
   *  des MFK-Datumsfelds. */
  heute: string;
  erinnerungen: Wartungserinnerung | null;
}) {
  const [state, formAction, pending] = useActionState(
    speichereWartungserinnerungen,
    LEERER_ZUSTAND,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="fahrzeug_id" value={fahrzeugId} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nächste MFK am
        <Input
          type="date"
          name="naechste_mfk_am"
          min="1950-01-01"
          max={plusJahre(heute, MFK_MAX_JAHRE_VORAUS)}
          defaultValue={erinnerungen?.naechste_mfk_am ?? ""}
          className="font-mono"
        />
        <span className="text-xs font-normal text-muted">
          Das Datum aus dem Aufgebot des Strassenverkehrsamts.
        </span>
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Service fällig</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            alle … km
            <Input
              type="text"
              name="service_intervall_km"
              inputMode="numeric"
              defaultValue={erinnerungen?.service_intervall_km?.toString() ?? ""}
              className="font-mono"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            alle … Monate
            <Input
              type="text"
              name="service_intervall_monate"
              inputMode="numeric"
              defaultValue={erinnerungen?.service_intervall_monate?.toString() ?? ""}
              className="font-mono"
            />
          </label>
        </div>
        <p className="text-xs text-muted">
          Beides zusammen möglich — dann gilt, was zuerst eintritt. Kilometer von{" "}
          {MIN_INTERVALL_KM} bis {MAX_INTERVALL_KM}, Monate von {MIN_INTERVALL_MONATE} bis{" "}
          {MAX_INTERVALL_MONATE}. Leer lassen heisst: keine Erinnerung.
        </p>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.erfolg && !state.error && (
        <p role="status" className="text-sm text-success">
          Gespeichert.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Speichern…" : "Erinnerungen speichern"}
        </Button>
      </div>
    </form>
  );
}
