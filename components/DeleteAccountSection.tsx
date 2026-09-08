"use client";

import { useActionState, useState } from "react";
import { ChevronDown } from "lucide-react";
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
    // Gefahrenzone, standardmässig zugeklappt: der rote Button soll nicht
    // dauerhaft neben "Passwort ändern" stehen, als wäre er eine Einstellung
    // wie jede andere. Natives <details> wie die Unterabschnitte der
    // Profilseite (app/profil/page.tsx, SectionSummary) — gleiche Klassen,
    // kein eigener State.
    <details className="group mt-2 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        Konto löschen
        <ChevronDown
          className="h-4 w-4 text-muted transition-transform duration-fast group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted">
          Entfernt dein Profil und deine GPS-Tracks endgültig; Fahrten und Bewertungen bleiben anonym.
        </p>
        <Button type="button" variant="danger" size="sm" className="self-start" onClick={() => setOpen(true)}>
          Konto löschen
        </Button>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Konto endgültig löschen">
        <p className="mb-4 text-sm text-muted">
          Dein Profil wird geleert — Name, Foto, Fahrzeuge und deine aufgezeichneten GPS-Tracks
          werden entfernt, alle Profil-Anzeigen abgeschaltet — und du wirst abgemeldet; mit deinen
          bisherigen Zugangsdaten kannst du dich danach nicht mehr anmelden. Fahrten und
          Bewertungen bleiben anonym erhalten und zählen weiterhin für Leaderboards. Diese Aktion
          kann nicht rückgängig gemacht werden.
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
    </details>
  );
}
