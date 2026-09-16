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
            ist (Begründung in lib/actions/auth.ts). Der Hinweis auf Dauer und
            Spam-Ordner steht deshalb hier — er gilt unabhängig von der
            Adresse und ersetzt die Fehlermeldung, die die Antwort sonst
            nach Kontoexistenz unterscheiden würde. */}
        <p className="text-sm text-foreground">
          Falls ein Konto mit dieser E-Mail-Adresse existiert, ist ein Link zum Zurücksetzen
          unterwegs. Der Versand braucht 1–2 Minuten — schau auch im Spam-Ordner nach, bevor du
          einen neuen Link anforderst.
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
      {/* Die Zahl ist gemessen, nicht geschätzt: der Versand über Supabase
          brauchte am 2026-09-16 rund 83 Sekunden (lib/actions/auth.ts nennt
          die Messung). Sie steht hier und nicht erst in der Bestätigung,
          weil sie dort zu spät käme — wer nach zwanzig Sekunden nichts im
          Postfach sieht, fordert sonst einen zweiten Link an, und jeder
          weitere Anlauf kostet wieder dieselbe Zeit.

          Kleiner gesetzt als der Satz darüber: es ist eine Fussnote zur
          Anleitung, keine zweite Anweisung. -mt-4 gegen den gap-6 des
          Containers, damit sie an dem Satz hängt, auf den sie sich bezieht. */}
      <p className="-mt-4 text-xs text-muted">Die E-Mail braucht 1–2 Minuten.</p>
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
