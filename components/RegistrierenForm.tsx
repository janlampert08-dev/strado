"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthFormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { LEGAL_URLS } from "@/lib/constants";

const initialState: AuthFormState = { error: null };

export default function RegistrierenForm({ nextHref }: { nextHref?: string } = {}) {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <>
      <h1 className="text-display font-semibold">Registrieren</h1>
      <form action={formAction} className="flex flex-col gap-4">
        {/* Optionales Rücksprungziel, wie in AnmeldenForm — signUp()
            validiert den Wert erneut, bevor daraus ein Redirect bzw. ein
            Bestätigungslink wird. */}
        {nextHref && <input type="hidden" name="next" value={nextHref} />}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Benutzername
          <Input
            type="text"
            name="display_name"
            required
            minLength={2}
            maxLength={50}
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          E-Mail
          <Input type="email" name="email" required autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Passwort
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
          {pending ? "Registrieren…" : "Registrieren"}
        </Button>
      </form>
      <p className="text-center text-xs text-muted">
        Mit der Registrierung akzeptierst du unsere{" "}
        <a
          href={LEGAL_URLS.agb}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-accent"
        >
          AGB
        </a>{" "}
        und{" "}
        <a
          href={LEGAL_URLS.datenschutz}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-accent"
        >
          Datenschutzerklärung
        </a>
        .
      </p>
      <p className="text-sm text-muted">
        Schon ein Konto?{" "}
        <Link
          href={nextHref ? `/anmelden?next=${encodeURIComponent(nextHref)}` : "/anmelden"}
          className="font-medium text-accent hover:underline"
        >
          Anmelden
        </Link>
      </p>
    </>
  );
}
