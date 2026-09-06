"use client";

import { useActionState, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { deleteAccount, type DeleteAccountState } from "@/lib/actions/auth";

const initialState: DeleteAccountState = { error: null };

// Eigene Dialog-Nutzung statt ConfirmDialog (components/ui/Dialog.tsx), da
// diese Aktion — anders als die übrigen ConfirmDialog-Nutzungen der App —
// eine erneute Passwort-Eingabe als zweiten Faktor braucht, siehe
// lib/actions/auth.ts (deleteAccount) für die Begründung.
export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);

  return (
    <div className="mt-2 border-t border-border pt-3">
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Konto löschen
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Konto endgültig löschen">
        <p className="mb-4 text-sm text-muted">
          Dein Profil wird geleert — Name, Foto, Fahrzeuge, deine aufgezeichneten GPS-Tracks und
          alle Einstellungen werden entfernt — und du wirst abgemeldet; mit deinen bisherigen
          Zugangsdaten kannst du dich danach nicht mehr anmelden. Fahrten und Bewertungen bleiben
          anonym erhalten und zählen weiterhin für Leaderboards. Diese Aktion kann nicht rückgängig
          gemacht werden.
        </p>
        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Passwort zur Bestätigung
            <Input type="password" name="password" required autoComplete="current-password" />
          </label>
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              {pending ? "Wird gelöscht…" : "Konto endgültig löschen"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
