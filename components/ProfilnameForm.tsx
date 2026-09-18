"use client";

import { useActionState } from "react";
import { aendereProfilnamen, type ProfileActionState } from "@/lib/actions/profile";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const initialState: ProfileActionState = { error: null };

/**
 * Anzeigename ändern. Bisher gab es keinen Weg dazu — der Name aus der
 * Registrierung blieb für immer (Review 2026-09-17). Die Regeln prüft die
 * Datenbank (0103), hier steht nur das Feld und die Rückmeldung.
 */
export default function ProfilnameForm({ aktuellerName }: { aktuellerName: string | null }) {
  const [state, formAction, pending] = useActionState(aendereProfilnamen, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="display_name" className="text-sm font-medium">
        Anzeigename
      </label>
      <div className="flex gap-2">
        <Input
          id="display_name"
          name="display_name"
          defaultValue={aktuellerName ?? ""}
          minLength={2}
          maxLength={50}
          required
          autoComplete="nickname"
          invalid={!!state.error}
          aria-describedby="display_name_hinweis"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="shrink-0">
          {pending ? "Speichern…" : "Speichern"}
        </Button>
      </div>
      <p id="display_name_hinweis" role="status" className="min-h-5 text-xs text-muted">
        {state.error ? (
          <span className="text-danger">{state.error}</span>
        ) : state.success ? (
          "Gespeichert."
        ) : (
          "So erscheinst du im Feed, in den Ranglisten und auf deinem Profil."
        )}
      </p>
    </form>
  );
}
