"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import PremiumCheckoutForm from "@/components/PremiumCheckoutForm";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import { LEGAL_URLS } from "@/lib/constants";
import {
  betragText,
  jahresVorteilProzent,
  monatsAequivalentRappen,
  planTitel,
  planZeitraum,
} from "@/lib/premiumAngebot";
import type { AboPlan, PremiumAngebot, PlanAngebot } from "@/lib/premiumLimits";

// Betrag so anzeigen, wie Stripe ihn führt — nicht aus einer zweiten Liste
// im Code. Weicht die beworbene Zahl vom abgebuchten Betrag ab, ist das kein
// Anzeigefehler, sondern ein falsch ausgezeichneter Preis. Das Formatieren,
// das Rechnen und die Benennung der Pläne liegen in lib/premiumAngebot.ts,
// weil es dort geprüft werden kann (Vitest kennt nur lib/) und weil das
// Bezahlfenster dieselben Wörter braucht.

// Nur, was es gibt. Die frühere Liste versprach "Erweiterte Filter und
// Statistiken" und ein Gold-Abzeichen — beides nicht ausgeliefert, und auf
// einer Kaufseite ist ein versprochenes Feature eine Vertragsleistung.
const VORTEILE = [
  "Eigene Strecken erstellen — privat für dich oder öffentlich nach Review",
  "12 statt 6 Fotos pro Fahrt",
  "Unbegrenzt Strecken offline speichern",
  "GPX-Export kuratierter Strecken",
];

// Einheitliche Abschnittsmarke für die ganze Seite — dieselbe Optik wie die
// Überschrift in PremiumCard.tsx, damit "Was Premium dazugibt", "Plan
// wählen" und "Bevor du bestätigst" beim Überfliegen als gleichrangige
// Stufen lesbar sind statt als drei verschiedene Textsorten.
const ABSCHNITT_KLASSEN = "text-sm font-semibold tracking-wide text-muted uppercase";

export default function PremiumPurchaseView({ angebot }: { angebot: PremiumAngebot }) {
  const router = useRouter();
  // Der Jahresplan steht vorne, wenn es ihn gibt: er ist der günstigere pro
  // Monat.
  const [gewaehlt, setGewaehlt] = useState<AboPlan>(
    angebot.plaene.some((p) => p.plan === "jahr") ? "jahr" : "monat",
  );

  if (angebot.plaene.length === 0) {
    // Kein Angebot heisst ohne Zutun eine Sackgasse: die Seite verlangt eine
    // Anmeldung, zeigt dann aber nichts, was man tun könnte. Deshalb derselbe
    // Leerzustand wie überall sonst — mit einem Weg zurück.
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display font-semibold">Strado unterstützen</h1>
        <EmptyState
          icon={Sparkles}
          title="Der Abo-Abschluss ist zurzeit nicht verfügbar. Bitte versuch es später noch einmal."
          action={
            <Link href="/profil" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Zum Profil
            </Link>
          }
        />
      </div>
    );
  }

  const aktiv = angebot.plaene.find((p) => p.plan === gewaehlt) ?? angebot.plaene[0];
  const monatsplan = angebot.plaene.find((p) => p.plan === "monat");
  const jahresplan = angebot.plaene.find((p) => p.plan === "jahr");
  const vorteilProzent = jahresVorteilProzent(monatsplan, jahresplan);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold tracking-wide text-accent uppercase">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Premium
        </span>
        {/* Die Überschrift sagt weiterhin "unterstützen", der Text darunter
            sagt "schaltet frei" — beides stimmt, und nur beides zusammen ist
            ehrlich: seit eigene Strecken Premium sind (0077), gibt es eine
            Bezahlschranke, und die soll hier nicht als reine Spende
            verkleidet sein. Die Kernschleife bleibt trotzdem kostenlos. */}
        <h1 className="text-display font-semibold">Strado unterstützen</h1>
        <p className="text-sm text-muted">
          Entdecken, Aufzeichnen, Bestenlisten und Feed bleiben gratis. Premium schaltet eigene
          Strecken frei — und ist die Art, wie Strado sich trägt.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={ABSCHNITT_KLASSEN}>Was Premium dazugibt</h2>
        <ul className="flex flex-col gap-2.5 text-sm text-foreground">
          {VORTEILE.map((vorteil) => (
            <li key={vorteil} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span>{vorteil}</span>
            </li>
          ))}
        </ul>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className={`mb-3 ${ABSCHNITT_KLASSEN}`}>Plan wählen</legend>
        {angebot.plaene.map((p) => (
          <PlanOption
            key={p.plan}
            angebot={p}
            gewaehlt={p.plan === gewaehlt}
            vorteilProzent={p.plan === "jahr" ? vorteilProzent : null}
            onWaehlen={() => setGewaehlt(p.plan)}
          />
        ))}
      </fieldset>

      <section className="flex flex-col gap-3">
        {/* Die Pflichtangaben vor dem Kauf, nicht danach: automatische
            Verlängerung, Kündigungsweg, Widerrufslage. Sie stehen hier im Text
            und nicht nur im verlinkten Dokument, weil ein Link auf 16 Ziffern
            AGB niemand vor dem Bezahlen liest — und unmittelbar über der
            Schaltfläche, die die Zahlungspflicht auslöst, nicht irgendwo
            weiter oben auf der Seite. */}
        <h2 className={ABSCHNITT_KLASSEN}>Bevor du bestätigst</h2>
        <Card surface className="flex flex-col gap-2 px-4 py-3 text-sm text-muted">
          <p>
            Das Abo verlängert sich automatisch um{" "}
            {gewaehlt === "monat" ? "einen Monat" : "zwölf Monate"}, bis du kündigst. Kündigen
            kannst du jederzeit ohne Frist in deinem Profil — Premium läuft dann bis zum Ende der
            bezahlten Periode weiter.
          </p>
          <p>
            Nicht zufrieden? Innerhalb von 14 Tagen nach dem ersten Abschluss bekommst du den Betrag
            auf formlose Anfrage zurück. Das ist eine freiwillige Zusage, kein gesetzliches
            Widerrufsrecht.
          </p>
          <p>
            Es gelten die{" "}
            <a
              href={LEGAL_URLS.agb}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              AGB
            </a>{" "}
            und die{" "}
            <a
              href={LEGAL_URLS.datenschutz}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Datenschutzerklärung
            </a>
            .
          </p>
        </Card>

        {/* key auf dem Plan: wechselt die Wahl, muss ein bereits vorbereitetes
            Payment Element verworfen werden — sonst zahlte man den Betrag des
            zuvor gewählten Plans. Ein offenes Bezahlfenster geht dabei zu,
            was richtig ist: es zeigte den alten Betrag.

            Übergeben wird `aktiv` statt `gewaehlt` samt Preis daneben, damit
            Plan und ausgezeichneter Betrag garantiert aus derselben Zeile des
            Angebots stammen. */}
        <PremiumCheckoutForm
          key={gewaehlt}
          angebot={aktiv}
          onSuccess={() => router.push("/profil")}
        />
      </section>
    </div>
  );
}

function PlanOption({
  angebot,
  gewaehlt,
  vorteilProzent,
  onWaehlen,
}: {
  angebot: PlanAngebot;
  gewaehlt: boolean;
  /** Ersparnis gegenüber zwölf Monatszahlungen, nur für den Jahresplan. */
  vorteilProzent: number | null;
  onWaehlen: () => void;
}) {
  const istJahr = angebot.plan === "jahr";
  const abzeichen = vorteilProzent !== null ? `${vorteilProzent} % günstiger` : null;

  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 transition-colors duration-fast ease-standard ${
        gewaehlt ? "border-accent bg-accent-subtle" : "border-border hover:border-border-strong"
      }`}
    >
      <input
        type="radio"
        name="plan"
        value={angebot.plan}
        checked={gewaehlt}
        onChange={onWaehlen}
        className="mt-1 h-4 w-4 shrink-0 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{planTitel(angebot.plan)}</span>
          {abzeichen && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-background">
              {abzeichen}
            </span>
          )}
        </span>

        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-title font-semibold text-foreground">
            {betragText(angebot.betragRappen, angebot.waehrung)}
          </span>
          <span className="text-sm text-muted">{planZeitraum(angebot.plan)}</span>
        </span>

        {istJahr && (
          <span className="text-xs text-muted">
            entspricht {betragText(monatsAequivalentRappen(angebot.betragRappen), angebot.waehrung)}{" "}
            pro Monat
          </span>
        )}
      </span>
    </label>
  );
}
