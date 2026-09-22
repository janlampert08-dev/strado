"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { signUp, type AuthFormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { LEGAL_URLS } from "@/lib/constants";
import useEingabenBewahren from "@/components/useEingabenBewahren";

const initialState: AuthFormState = { error: null };

export default function RegistrierenForm({
  nextHref,
  promoCode,
}: {
  nextHref?: string;
  promoCode?: string | null;
} = {}) {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  // Drei Felder, und ohne das wären nach einem Fehlschlag alle drei leer —
  // siehe components/useEingabenBewahren.ts.
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  // Promo-Code aus dem Signup-Link (app/registrieren/page.tsx):
  // ?promo=7-tage-gratis wird als verstecktes Feld an signUp()
  // weitergereicht und dort in raw_user_meta_data.promo_code gelegt.
  // Der Trigger handle_new_user() (0121) prüft den Code und vergibt
  // 7 Tage Premium — ohne dass der Nutzer etwas eingeben muss.
  const hatPromo = !!promoCode;

  return (
    <>
      {hatPromo && (
        <p className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">
          Dein Link beinhaltet 7 Tage Premium kostenlos — sie werden nach
          der Registrierung aktiv und enden automatisch.
        </p>
      )}
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        {/* Optionales Rücksprungziel, wie in AnmeldenForm — signUp()
            validiert den Wert erneut, bevor daraus ein Redirect bzw. ein
            Bestätigungslink wird. */}
        {nextHref && <input type="hidden" name="next" value={nextHref} />}
        {hatPromo && (
          <input type="hidden" name="promo_code" value={promoCode} />
        )}
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
