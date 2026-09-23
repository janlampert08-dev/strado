"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fordereCodeFuerAdresse, type CodeAnfordernState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const initialState: CodeAnfordernState = { error: null, gesendet: false };

// Code aufs andere Gerät holen: am Laptop registriert, am Handy bestätigt —
// dort steht kein Bestätigungs-Cookie, also zeigte die Seite bisher nur
// "melde dich an". Hier genügt die Adresse aus der Registrierung: der Code
// geht an dieses Postfach, und erst danach weiss die Seite wieder, welche
// Adresse gemeint ist (die Action setzt das Cookie neu).
//
// Nach dem Versand lädt die Seite neu: das Cookie steht dann, und statt
// diesem Formular erscheint das Code-Formular. Die Antwort verrät nie, ob
// zu der Adresse eine offene Registrierung existiert (lib/actions/auth.ts).
export default function AnderesGeraetForm() {
  const [state, formAction, pending] = useActionState(fordereCodeFuerAdresse, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.gesendet) router.refresh();
  }, [state.gesendet, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-display font-semibold">Code auf dieses Gerät holen</h1>
      <p className="text-sm text-muted">
        Anderswo registriert? Gib die E-Mail-Adresse aus der Registrierung
        ein — wir schicken den Code erneut, und du gibst ihn hier ein.
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-Mail
        <Input type="email" name="email" required autoComplete="email" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.gesendet && (
        <p role="status" className="text-sm text-success">
          Code ist unterwegs — gib ihn ein, sobald er da ist.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Wird gesendet…" : "Code senden"}
      </Button>
    </form>
  );
}
