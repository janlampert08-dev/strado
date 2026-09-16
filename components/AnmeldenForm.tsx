"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { signIn, type AuthFormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button, { textAktionClassName } from "@/components/ui/Button";
import useEingabenBewahren from "@/components/useEingabenBewahren";

const initialState: AuthFormState = { error: null };

export default function AnmeldenForm({ nextHref }: { nextHref?: string } = {}) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  // Ohne das stünde nach "E-Mail oder Passwort ist falsch." ein leeres
  // Formular da — siehe components/useEingabenBewahren.ts.
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  return (
    <>
      <h1 className="text-display font-semibold">Anmelden</h1>
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
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
          // Gedämpft statt im Akzent: der Link steht direkt unter dem
          // Passwortfeld und soll dem Anmelden-Knopf darunter nicht die
          // Aufmerksamkeit streitig machen. -mt-4 nimmt die Höhe, die die
          // 44-px-Tippfläche dazubringt, aus dem Abstand zum Feld darüber
          // wieder heraus (das Formular steht auf gap-4).
          className={textAktionClassName({ ton: "gedaempft", className: "-mt-4 self-start" })}
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
