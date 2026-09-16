"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import {
  bestaetigeRegistrierung,
  sendeBestaetigungErneut,
  type BestaetigungState,
  type ErneutSendenState,
} from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import useEingabenBewahren from "@/components/useEingabenBewahren";

const codeStart: BestaetigungState = { error: null };
const erneutStart: ErneutSendenState = { error: null, gesendet: false };

export default function BestaetigenForm({
  // Angedeutete Adresse (lib/bestaetigung.ts). Ohne sie wüsste niemand, in
  // welches von mehreren Postfächern er schauen soll; vollständig
  // ausgeschrieben stünde sie auf einem Bildschirm, der offen herumliegt.
  emailHinweis,
  // Als Prop und nicht als Import von CODE_LAENGE: lib/bestaetigung.ts
  // greift über safeInternalPath auf lib/utils/url.ts und damit auf
  // next/headers zu. Ein Import von hier zöge das ins Browser-Bundle und
  // bricht den Build — dieselbe Falle, die AGENTS.md für
  // lib/premiumLimits.ts beschreibt. Die Seite ist eine Server Component
  // und reicht den Wert deshalb einfach durch.
  codeLaenge,
}: {
  emailHinweis: string;
  codeLaenge: number;
}) {
  const [codeStatus, codeAbsenden, codeLaeuft] = useActionState(
    bestaetigeRegistrierung,
    codeStart,
  );
  const [erneutStatus, erneutAbsenden, erneutLaeuft] = useActionState(
    sendeBestaetigungErneut,
    erneutStart,
  );

  // Ohne das stünde das Feld nach einem falschen Code leer da — React 19
  // leert unkontrollierte Felder bei einem Formular, das über eine Action
  // zurückkommt. Hier wiegt das schwerer als anderswo: wer einen Code
  // abgetippt und sich bei einer Ziffer vertan hat, müsste alle sechs neu
  // suchen. Siehe components/useEingabenBewahren.ts.
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  return (
    <>
      <h1 className="text-display font-semibold">Fast geschafft</h1>
      <p className="text-sm text-muted">
        Wir haben dir einen {codeLaenge}-stelligen Code an{" "}
        <span className="font-medium text-foreground">{emailHinweis}</span>{" "}
        geschickt. Gib ihn hier ein, um dein Konto zu aktivieren. Schau auch im
        Spam-Ordner nach.
      </p>

      <form ref={formRef} action={codeAbsenden} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Code aus der E-Mail
          <Input
            type="text"
            name="code"
            required
            // one-time-code lässt iOS und Android den Code direkt aus der
            // Mitteilung heraus anbieten — der kürzeste Weg vom Postfach
            // zurück ins Formular, und der Grund, warum der Code auch im
            // Betreff der Vorlage steht.
            autoComplete="one-time-code"
            inputMode="numeric"
            // Grosszügiger als sechs Zeichen: aus der E-Mail kopierte Codes
            // bringen Leerzeichen mit, und ein hartes Limit würde die
            // Einfügung stillschweigend abschneiden. Der Server räumt das
            // auf (codeNormalisieren).
            maxLength={16}
            autoFocus
            className="font-mono text-lg tracking-[0.4em]"
            aria-describedby={codeStatus.error ? "code-fehler" : undefined}
          />
        </label>
        {codeStatus.error && (
          <p id="code-fehler" role="alert" className="text-sm text-danger">
            {codeStatus.error}
          </p>
        )}
        <Button type="submit" disabled={codeLaeuft} className="mt-1">
          {codeLaeuft ? "Wird geprüft…" : "Konto aktivieren"}
        </Button>
      </form>

      {/* Eigenes Formular statt eines zweiten Knopfes im ersten: ein
          verschachteltes <form> gibt es nicht, und der erneute Versand darf
          den eingetippten Code nicht mitschicken. */}
      <form action={erneutAbsenden} className="flex flex-col gap-2">
        {erneutStatus.gesendet ? (
          <p role="status" className="text-sm text-success">
            Ein neuer Code ist unterwegs.
          </p>
        ) : (
          erneutStatus.error && (
            <p role="alert" className="text-sm text-danger">
              {erneutStatus.error}
            </p>
          )
        )}
        <Button
          type="submit"
          variant="ghost"
          disabled={erneutLaeuft}
          className="self-start px-0"
        >
          {erneutLaeuft ? "Wird gesendet…" : "Neuen Code anfordern"}
        </Button>
      </form>

      <p className="text-sm text-muted">
        Falsche Adresse eingegeben?{" "}
        <Link
          href="/registrieren"
          className="font-medium text-accent hover:underline"
        >
          Nochmal registrieren
        </Link>
      </p>
    </>
  );
}
