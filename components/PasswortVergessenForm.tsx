"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { requestPasswordReset, type RequestPasswordResetState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import useEingabenBewahren from "@/components/useEingabenBewahren";

const initialState: RequestPasswordResetState = { error: null, requested: false };

export default function PasswortVergessenForm({
  // Warum der vorherige Link nicht funktioniert hat, sofern es einen gab —
  // gesetzt von der Seite aus dem ?fehler=-Parameter, den
  // app/auth/callback/route.ts hinterlässt. Fester Text aus
  // lib/authFehler.ts, nie durchgereichte Adresszeile.
  hinweis = null,
}: {
  hinweis?: string | null;
} = {}) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);
  // Siehe components/useEingabenBewahren.ts. Der Erfolgszweig unten hängt
  // das Formular ohnehin ab, bewahrt wird also nur der Fehlerfall.
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  if (state.requested) {
    return (
      <>
        <h1 className="text-display font-semibold">Passwort vergessen</h1>
        {/* Bewusst konstant: dieselbe Antwort, ob es das Konto gibt oder
            nicht, und auch dann, wenn der Versand serverseitig gescheitert
            ist (Begründung in lib/actions/auth.ts).

            KEINE ZEITANGABE. Hier stand "1–2 Minuten", gestützt auf die
            gemessenen 83 Sekunden bis zur Bestätigung von Supabase. Diese
            Bestätigung heisst aber nur "angenommen", nicht "zugestellt":
            solange kein eigener SMTP-Dienstleister konfiguriert ist,
            verweigert Supabase Auth die Zustellung an jede Adresse, die
            nicht zum Projekt-Team gehört — nachgelesen in der Supabase-
            Dokumentation, nachgewiesen an zwei Anfragen vom 2026-09-16
            (Status 200, keine Mail). Eine Dauer zu nennen hiesse also eine
            Ankunft zu versprechen, die für die meisten Adressen gar nicht
            stattfindet. Sobald der Versand über einen eigenen Dienst läuft,
            gehört die Angabe wieder her — dann stimmt sie auch. */}
        <p className="text-sm text-foreground">
          Falls ein Konto mit dieser E-Mail-Adresse existiert, ist ein Link zum Zurücksetzen
          unterwegs. Schau auch im Spam-Ordner nach.
        </p>
        <p className="text-sm text-muted">
          <Link href="/anmelden" className="font-medium text-accent hover:underline">
            Zurück zur Anmeldung
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-display font-semibold">Passwort vergessen</h1>
      {hinweis && (
        <p
          className="-mt-3 rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger"
        >
          {hinweis}
        </p>
      )}
      <p className="text-sm text-muted">
        Gib deine E-Mail-Adresse ein — wir schicken dir einen Link zum Zurücksetzen.
      </p>
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          E-Mail
          <Input type="email" name="email" required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="mt-1">
          {pending ? "Wird gesendet…" : "Link anfordern"}
        </Button>
      </form>
      <p className="text-sm text-muted">
        <Link href="/anmelden" className="font-medium text-accent hover:underline">
          Zurück zur Anmeldung
        </Link>
      </p>
    </>
  );
}
