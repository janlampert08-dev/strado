"use client";

import { useActionState } from "react";
import { signInMitGoogle, type AuthFormState } from "@/lib/actions/auth";
import Button from "@/components/ui/Button";

const initialState: AuthFormState = { error: null };

// Das Google-"G" als Inline-SVG in den vier Markenfarben — kein Fremd-Asset,
// kein Icon-Font, CSP-sicher. Deko neben der Beschriftung (aria-hidden).
function GoogleZeichen() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// Ein Tap statt E-Mail + Passwort + Code. Die Action schickt den Browser zu
// Google, zurück geht es über /auth/callback (lib/actions/auth.ts erklärt,
// was OAuth mitbringt und was nicht).
export default function GoogleLoginButton({ nextHref }: { nextHref?: string } = {}) {
  const [state, formAction, pending] = useActionState(signInMitGoogle, initialState);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        {nextHref && <input type="hidden" name="next" value={nextHref} />}
        <Button type="submit" variant="secondary" size="md" disabled={pending} className="w-full">
          <GoogleZeichen />
          {pending ? "Weiter zu Google…" : "Weiter mit Google"}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
