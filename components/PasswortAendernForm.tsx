"use client";

import { useActionState, useRef } from "react";
import { updatePassword, type UpdatePasswordState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import useEingabenBewahren from "@/components/useEingabenBewahren";

const initialState: UpdatePasswordState = { error: null };

export default function PasswortAendernForm({
  // true heisst: die Sitzung stammt aus einem Zurücksetzen-Link, das alte
  // Passwort ist also naturgemäss unbekannt und wird nicht abgefragt. Die
  // Entscheidung fällt serverseitig (lib/passwortWiederherstellung.ts) —
  // diese Prop steuert nur, welches Formular zu sehen ist.
  ausWiederherstellung,
}: {
  ausWiederherstellung: boolean;
}) {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);
  // Siehe components/useEingabenBewahren.ts. Hier wiegt es am schwersten:
  // wer ein neues Passwort tippt, hat es sich gerade ausgedacht — nach dem
  // Leeren ist es unter Umständen nicht mehr rekonstruierbar.
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  return (
    <>
      <h1 className="text-display font-semibold">
        {ausWiederherstellung ? "Neues Passwort" : "Passwort ändern"}
      </h1>
      {!ausWiederherstellung && (
        <p className="-mt-3 text-sm text-muted">
          Zur Sicherheit brauchen wir zuerst dein aktuelles Passwort — sonst könnte jemand an
          einem unbeaufsichtigten Gerät dein Konto übernehmen.
        </p>
      )}
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        {!ausWiederherstellung && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Aktuelles Passwort
            <Input
              type="password"
              name="aktuelles_passwort"
              required
              autoComplete="current-password"
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Neues Passwort
          <Input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="mt-1">
          {pending ? "Wird gespeichert…" : "Passwort speichern"}
        </Button>
      </form>
    </>
  );
}
