"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, CreditCard, SparklesIcon } from "@/components/NavIcons";
import EmptyState from "@/components/ui/EmptyState";
import SectionHeading from "@/components/ui/SectionHeading";
import PremiumBadge from "@/components/PremiumBadge";
import { buttonVariants } from "@/components/ui/Button";
import {
  betragText,
  jahresVorteilProzent,
  monatsAequivalentRappen,
  planTitel,
  planZeitraum,
  saisonpassMonatsAequivalentRappen,
  saisonpassVerlaengerbar,
} from "@/lib/premiumAngebot";
import { datumCH } from "@/lib/format";
import { PREMIUM_VORTEILE } from "@/lib/premiumVorteile";
import {
  SAISONPASS_MONATE,
  TESTPHASE_TAGE,
  type AboPlan,
  type PremiumAngebot,
  type PlanAngebot,
} from "@/lib/premiumLimits";

// Betrag so anzeigen, wie Stripe ihn führt — nicht aus einer zweiten Liste
// im Code. Weicht die beworbene Zahl vom abgebuchten Betrag ab, ist das kein
// Anzeigefehler, sondern ein falsch ausgezeichneter Preis. Das Formatieren
// und das Rechnen dazu liegt in lib/premiumAngebot.ts, weil es dort geprüft
// werden kann (Vitest kennt nur lib/). planTitel/planZeitraum stehen aus
// demselben Grund dort — die Zahlungsseite (app/profil/premium/zahlung)
// braucht denselben Titel für denselben Plan.

// Die Liste steht in lib/premiumVorteile.ts, weil die Abschluss-Seite
// (components/PremiumWillkommen.tsx) sie ebenfalls zeigt: was hier
// versprochen wird, wird dort quittiert — zwei Kopien würden auseinander
// driften. Dort steht auch, warum nur hineingehört, was es tatsächlich gibt.

// Reihenfolge der Pläne auf dieser Seite, unabhängig davon, in welcher
// Reihenfolge lib/actions/billing.ts sie aus Stripe gelesen hat: das
// Jahresabo zuerst, weil es pro Monat das günstigste ist und (beim ersten
// Konto) die Testphase trägt; der Saisonpass daneben, weil er die Antwort
// auf die eigentliche Frage dieses Markts ist — "und im Winter?"; das
// Monatsabo zuletzt als niedrigste Hürde.
const REIHENFOLGE: AboPlan[] = ["jahr", "saisonpass", "monat"];

export default function PremiumPurchaseView({ angebot }: { angebot: PremiumAngebot }) {
  const passBisWert = angebot.saisonpassBis ? new Date(angebot.saisonpassBis) : null;

  // Ein zweiter Saisonpass mitten in der Saison wird von
  // createCheckoutSession abgewiesen (er wäre fast immer ein Versehen). Dann
  // gehört er auch nicht in die Auswahl: ein Plan, den man wählen kann und
  // der auf der nächsten Seite mit einer Fehlermeldung endet, ist schlechter
  // als einer, der dort nicht steht. Das Abo bleibt wählbar — es zahlt erst
  // ab dem Passende.
  const plaene = REIHENFOLGE.map((plan) => angebot.plaene.find((p) => p.plan === plan))
    .filter((p): p is PlanAngebot => Boolean(p))
    .filter((p) => p.plan !== "saisonpass" || saisonpassVerlaengerbar(passBisWert));

  const [gewaehlt, setGewaehlt] = useState<AboPlan>(plaene[0]?.plan ?? "jahr");

  if (plaene.length === 0) {
    // Kein Angebot heisst ohne Zutun eine Sackgasse: die Seite verlangt eine
    // Anmeldung, zeigt dann aber nichts, was man tun könnte. Deshalb derselbe
    // Leerzustand wie überall sonst — mit einem Weg zurück.
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display font-semibold">Strado Premium</h1>
        <EmptyState
          icon={Sparkles}
          title="Premium ist gerade nicht erhältlich"
          description="Versuch es in ein paar Stunden noch einmal – an deinem Konto ändert sich nichts."
          action={
            <Link href="/profil" className={buttonVariants({ variant: "secondary", size: "md" })}>
              Zum Profil
            </Link>
          }
        />
      </div>
    );
  }

  const aktiv = plaene.find((p) => p.plan === gewaehlt) ?? plaene[0];
  const monatsplan = plaene.find((p) => p.plan === "monat");
  const jahresplan = plaene.find((p) => p.plan === "jahr");
  const vorteilProzent = jahresVorteilProzent(monatsplan, jahresplan);
  const passBis = passBisWert;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <PremiumBadge />
        {/* Bis hierher hiess die Überschrift "Strado unterstützen", und der
            Absatz darunter zählte auf, was gratis bleibt. Das war ehrlich und
            zu leise: wer auf dieser Seite landet, hat schon verstanden, dass
            die App gratis nutzbar ist — er will wissen, was er bekommt.
            Deshalb steht der Nutzen jetzt vorn und die Unterstützung als
            zweiter Satz. Sie fällt nicht weg: sie ist der Grund, aus dem es
            diesen Preis überhaupt gibt, und sie trägt ihn mit (siehe
            docs/premium-neu/preise.md).

            Was hier NICHT stehen darf, ist ein Nutzen, den
            PREMIUM_VORTEILE nicht hergibt — die Liste ist über AGB
            Ziff. 3.2 eine zugesagte Vertragsleistung. Die Überschrift
            spricht deshalb von der Saison und nicht von einer Funktion. */}
        <h1 className="text-display font-semibold">Mehr aus jeder Saison</h1>
        <p className="text-sm text-muted">
          Deine Strecken ins Navi, das Wetterfenster für die Woche, jeder Pass, den du hattest, und
          ein Wartungsheft, das mitzählt. Entdecken, Aufzeichnen, Ranglisten und Feed bleiben
          gratis — Premium ist das, was darüber hinausgeht, und die Art, wie Strado sich trägt.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading icon={SparklesIcon}>In Premium enthalten</SectionHeading>
        <ul className="flex flex-col gap-2.5 text-sm text-foreground">
          {PREMIUM_VORTEILE.map((vorteil) => (
            <li key={vorteil} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden="true" />
              <span>{vorteil}</span>
            </li>
          ))}
        </ul>
      </section>

      <fieldset className="flex flex-col gap-2">
        <SectionHeading as="legend" icon={CreditCard} className="mb-3">
          Plan wählen
        </SectionHeading>
        {plaene.map((p) => (
          <PlanOption
            key={p.plan}
            angebot={p}
            gewaehlt={p.plan === gewaehlt}
            vorteilProzent={p.plan === "jahr" ? vorteilProzent : null}
            testphase={p.plan === "jahr" && angebot.testphaseMoeglich}
            onWaehlen={() => setGewaehlt(p.plan)}
          />
        ))}
      </fieldset>

      {/* Ein laufender Pass ändert, was beim Abschluss passiert — und zwar
          zum Vorteil: gezahlt wird erst, wenn der Pass endet. Das gehört auf
          die Seite, auf der man den Plan wählt, nicht erst auf die
          Zahlungsseite. */}
      {passBis && (
        <p className="text-sm text-muted">
          Dein Saisonpass gilt bis {datumCH(passBis)}. Ein Abo, das du jetzt abschliesst, zahlt
          erst ab diesem Tag.
        </p>
      )}

      {/* Das Bezahlformular selbst steht auf einer eigenen Seite
          (app/profil/premium/zahlung) — dort auch die Pflichtangaben
          (automatische Verlängerung, Kündigungsweg, Widerrufslage), direkt
          über der Schaltfläche, die die Zahlungspflicht tatsächlich auslöst.
          plan und preis wandern als Query-Parameter mit: preis ist nur der
          Anzeigewert vom Laden dieser Seite — abgebucht wird, was Stripe für
          die Session tatsächlich vergibt (siehe PremiumCheckoutForm). */}
      <p className="text-xs text-muted">
        Bezahlen mit TWINT oder Karte · Endpreise in CHF · Kündigung im Kundenportal
      </p>
      <Link
        href={`/profil/premium/zahlung?plan=${gewaehlt}&preis=${aktiv.betragRappen}`}
        className={buttonVariants({ className: "w-full" })}
      >
        {gewaehlt === "jahr" && angebot.testphaseMoeglich
          ? `${TESTPHASE_TAGE} Tage gratis testen`
          : "Weiter zur Zahlung"}
      </Link>
    </div>
  );
}

function PlanOption({
  angebot,
  gewaehlt,
  vorteilProzent,
  testphase,
  onWaehlen,
}: {
  angebot: PlanAngebot;
  gewaehlt: boolean;
  /** Ersparnis gegenüber zwölf Monatszahlungen, nur für den Jahresplan. */
  vorteilProzent: number | null;
  /** Gratis-Testphase auf diesem Plan möglich. */
  testphase: boolean;
  onWaehlen: () => void;
}) {
  const istJahr = angebot.plan === "jahr";
  const istPass = angebot.plan === "saisonpass";

  // Höchstens ein Abzeichen pro Zeile. Zwei nebeneinander ("34 % günstiger"
  // und "14 Tage gratis") lesen sich als Reklame und brechen auf 390 px in
  // die zweite Zeile; das Prozent steht ausserdem ohnehin weiter unten als
  // Monatsäquivalent. Die Testphase gewinnt, weil sie das ist, was den
  // nächsten Schritt kostenlos macht.
  const abzeichen = testphase
    ? `${TESTPHASE_TAGE} Tage gratis`
    : vorteilProzent !== null
      ? `${vorteilProzent} % günstiger`
      : istPass
        ? "verlängert sich nicht"
        : null;

  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 transition-colors duration-fast ease-standard ${
        gewaehlt ? "border-accent bg-accent-subtle" : "border-border hover:border-muted"
      }`}
    >
      <input
        type="radio"
        name="plan"
        value={angebot.plan}
        checked={gewaehlt}
        onChange={onWaehlen}
        className="mt-1 h-4 w-4 shrink-0 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{planTitel(angebot.plan)}</span>
          {abzeichen && (
            <span
              className={
                istPass
                  ? "rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium text-muted"
                  : "rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent"
              }
            >
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

        {/* Der Satz, der den Pass erklärt, statt ihn nur zu bepreisen: sechs
            Monate, eine Zahlung, kein Abo. "Keine Kündigung nötig" ist das
            Versprechen, das ihn vom Monatsabo unterscheidet — und der Grund,
            warum er als Einmalzahlung gebaut ist (0110). */}
        {istPass && (
          <span className="text-xs text-muted">
            entspricht{" "}
            {betragText(saisonpassMonatsAequivalentRappen(angebot.betragRappen), angebot.waehrung)}{" "}
            pro Monat · {SAISONPASS_MONATE} Monate ab Kauf, keine Kündigung nötig
          </span>
        )}

        {testphase && (
          <span className="text-xs text-muted">
            Die ersten {TESTPHASE_TAGE} Tage kosten nichts. Kündigst du vorher, wird nichts
            abgebucht.
          </span>
        )}
      </span>
    </label>
  );
}
