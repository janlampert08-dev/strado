import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { datumCH } from "@/lib/format";
import { planName } from "@/lib/premiumAngebot";
import { PREMIUM_VORTEILE } from "@/lib/premiumVorteile";
import type { PremiumStatus } from "@/lib/premiumLimits";

// Der Moment nach der Zahlung.
//
// Vorher gab es ihn nicht: die Abschluss-Seite leitete nach erfolgreicher
// Bestätigung sofort auf /profil um, und wer gerade bezahlt hatte, landete
// wortlos auf derselben Seite wie immer — mit einer Abo-Zeile mehr. Das ist
// die Stelle, an der jemand Geld gegeben hat; sie darf sich nach etwas
// anfühlen und muss vor allem beantworten, was jetzt anders ist.
//
// Reine Anzeige, keine Berechtigungsprüfung: dass Premium tatsächlich
// aktiv ist, entscheidet der Aufrufer über getPremiumStatus() bzw. die bei
// Stripe verifizierte Bestätigung. Diese Komponente glaubt niemandem
// etwas — sie stellt nur dar.

// Plan-Benennung und Datumsformat kommen aus lib/ und werden mit
// components/PremiumCard.tsx auf der Profilseite geteilt: wer hier
// "Jahresabo" liest, soll es dort wiederfinden — und dasselbe Datum
// gleich mit.

export default function PremiumWillkommen({
  status,
}: {
  /** null, solange nur feststeht, dass die Zahlung durch ist — die
   *  Abo-Zeile mit Plan und Periodenende kommt dann mit dem nächsten
   *  Server-Render nach (siehe components/AboBestaetigung.tsx). Der Gruss
   *  soll deshalb nicht auf diese Angaben warten. */
  status: PremiumStatus | null;
}) {
  const plan = status?.plan ? planName(status.plan) : null;
  const verlaengertAm = status?.laeuftAbAm ? null : (status?.periodeEndetAm ?? null);

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        {/* Der Ring läuft einmal nach aussen aus und verschwindet — das
            Aufleuchten, das den Abschluss quittiert. aria-hidden, weil er
            nichts sagt, was der Text nicht sagt. */}
        <span
          aria-hidden="true"
          className="abschluss-ring absolute inset-0 rounded-full border-2 border-accent"
        />
        <span className="abschluss-abzeichen flex h-20 w-20 items-center justify-center rounded-full bg-accent text-background">
          <Check className="h-10 w-10" strokeWidth={2.5} aria-hidden="true" />
        </span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold tracking-wide text-accent uppercase">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Premium aktiv
        </span>
        <h1 className="text-display font-semibold">Willkommen bei Premium</h1>
        <p className="text-sm text-muted">
          Danke — du trägst Strado jetzt mit. Alles unten ist ab sofort für dich freigeschaltet.
        </p>
      </div>

      {(plan || verlaengertAm) && (
        <p className="text-sm text-muted">
          {plan}
          {plan && verlaengertAm && " · "}
          {verlaengertAm && <>verlängert sich am {datumCH(verlaengertAm)}</>}
        </p>
      )}

      <Card surface as="ul" className="flex w-full flex-col gap-2.5 px-4 py-4 text-left">
        {PREMIUM_VORTEILE.map((vorteil) => (
          <li key={vorteil} className="flex items-start gap-2.5 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{vorteil}</span>
          </li>
        ))}
      </Card>

      {/* Der erste Weg führt in die Funktion, für die die meisten bezahlt
          haben — eigene Strecken sind seit Migration 0077 die eigentliche
          Bezahlschranke. "Zum Profil" bleibt daneben stehen, weil dort das
          Abo verwaltet und gekündigt wird. */}
      <div className="flex w-full flex-col gap-2">
        <Link href="/strecken/neu" className={buttonVariants({ className: "w-full" })}>
          Eigene Strecke erstellen
        </Link>
        <Link
          href="/profil"
          className={buttonVariants({ variant: "secondary", className: "w-full" })}
        >
          Zum Profil
        </Link>
      </div>

      {/* Die Pflichtangaben standen vor dem Kauf auf der Zahlungsseite. Hier
          steht nur noch, was jetzt zu erwarten ist: eine Rechnung von
          Stripe, und wo gekündigt wird. */}
      <p className="text-xs text-muted">
        Die Rechnung schickt dir Stripe per E-Mail. Kündigen kannst du jederzeit ohne Frist im
        Profil — Premium läuft dann bis zum Ende der bezahlten Periode weiter.
      </p>
    </div>
  );
}
