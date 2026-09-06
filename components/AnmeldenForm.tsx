"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthFormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const initialState: AuthFormState = { error: null };

export default function AnmeldenForm({ nextHref }: { nextHref?: string } = {}) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <>
      <h1 className="text-display font-semibold">Anmelden</h1>
      <form action={formAction} className="flex flex-col gap-4">
        {/* Optionales Rücksprungziel, analog zu NeuesFahrzeugForm — signIn()
            validiert den Wert erneut, bevor daraus ein Redirect wird. */}
        {nextHref && <input type="hidden" name="next" value={nextHref} />}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          E-Mail
          <Input type="email" name="email" required autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Passwort
          <Input type="password" name="password" required autoComplete="current-password" />
        </label>
        <Link
          href="/anmelden/passwort-vergessen"
          className="-mt-2 self-start text-sm text-muted hover:text-accent hover:underline"
        >
          Passwort vergessen?
        </Link>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="mt-1">
          {pending ? "Anmelden…" : "Anmelden"}
        </Button>
      </form>
      <p className="text-sm text-muted">
        Noch kein Konto?{" "}
        <Link
          href={nextHref ? `/registrieren?next=${encodeURIComponent(nextHref)}` : "/registrieren"}
          className="font-medium text-accent hover:underline"
        >
          Registrieren
        </Link>
      </p>
    </>
  );
}
