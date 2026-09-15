"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { requestPasswordReset, type RequestPasswordResetState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import useEingabenBewahren from "@/components/useEingabenBewahren";

const initialState: RequestPasswordResetState = { error: null, requested: false };

export default function PasswortVergessenForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);
  // Siehe components/useEingabenBewahren.ts. Der Erfolgszweig unten hängt
  // das Formular ohnehin ab, bewahrt wird also nur der Fehlerfall.
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  if (state.requested) {
    return (
      <>
        <h1 className="text-display font-semibold">Passwort vergessen</h1>
        <p className="text-sm text-foreground">
          Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen
          verschickt.
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
      <p className="text-sm text-muted">
        Gib deine E-Mail-Adresse ein — wir schicken dir einen Link zum Zurücksetzen.
      </p>
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          E-Mail
          <Input type="email" name="email" required autoComplete="email" />
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
