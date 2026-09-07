"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PremiumCheckoutForm from "@/components/PremiumCheckoutForm";
import { LEGAL_URLS } from "@/lib/constants";
import type { AboPlan, PremiumAngebot, PlanAngebot } from "@/lib/premiumLimits";

// Betrag so anzeigen, wie Stripe ihn führt — nicht aus einer zweiten Liste
// im Code. Weicht die beworbene Zahl vom abgebuchten Betrag ab, ist das kein
// Anzeigefehler, sondern ein falsch ausgezeichneter Preis.
function preis(rappen: number, waehrung: string): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: waehrung.toUpperCase(),
  }).format(rappen / 100);
}

function planTitel(plan: AboPlan): string {
  return plan === "monat" ? "Monatlich" : "Jährlich";
}

function planZeitraum(plan: AboPlan): string {
  return plan === "monat" ? "pro Monat" : "pro Jahr";
}

export default function PremiumPurchaseView({ angebot }: { angebot: PremiumAngebot }) {
  const router = useRouter();
  // Der Jahresplan steht vorne, wenn es ihn gibt: er ist der günstigere pro
  // Monat, und beim Gründerpreis ist er zusätzlich begrenzt verfügbar.
  const [gewaehlt, setGewaehlt] = useState<AboPlan>(
    angebot.plaene.some((p) => p.plan === "jahr") ? "jahr" : "monat",
  );

  if (angebot.plaene.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display font-semibold">Cornice unterstützen</h1>
        <p className="text-sm text-muted">
          Der Abo-Abschluss ist zurzeit nicht verfügbar. Bitte versuch es später noch einmal.
        </p>
      </div>
    );
  }

  const aktiv = angebot.plaene.find((p) => p.plan === gewaehlt) ?? angebot.plaene[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {/* Bewusst "unterstützen" und nicht "freischalten": der Funktions-
            umfang allein trägt den Preis nicht, und so benannt zu werden ist
            ehrlicher als eine Bezahlschranke vorzutäuschen, die es nicht
            gibt — die Kernfunktionen bleiben kostenlos. */}
        <h1 className="text-display font-semibold">Cornice unterstützen</h1>
        <p className="text-sm text-muted">
          Entdecken, Aufzeichnen, Bestenlisten und Feed bleiben kostenlos. Premium hebt Grenzen an
          und ist vor allem eines: die Art, wie Cornice sich trägt.
        </p>
      </div>

      <ul className="flex flex-col gap-1.5 text-sm text-foreground">
        <li>· Unbegrenzt viele private Strecken</li>
        <li>· Gold-Abzeichen neben deinem Namen — wenn du magst</li>
        <li>· 12 statt 6 Fotos pro Fahrt</li>
        <li>· Unbegrenzt Strecken offline speichern</li>
        <li>· GPX-Export kuratierter Strecken mit einem Klick</li>
        <li>· Erweiterte Filter und Statistiken</li>
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-muted uppercase tracking-wide">
          Plan wählen
        </legend>
        {angebot.plaene.map((p) => (
          <PlanOption
            key={p.plan}
            angebot={p}
            gewaehlt={p.plan === gewaehlt}
            onWaehlen={() => setGewaehlt(p.plan)}
          />
        ))}
      </fieldset>

      {aktiv.istGruenderpreis && (
        <p className="text-sm text-muted">
          Gründerpreis — noch {angebot.gruenderPlaetzeFrei} von 100 Plätzen frei. Der Preis bleibt,
          solange das Abo ununterbrochen läuft.
        </p>
      )}

      {/* Die Pflichtangaben vor dem Kauf, nicht danach: automatische
          Verlängerung, Kündigungsweg, Widerrufslage. Sie stehen hier im Text
          und nicht nur im verlinkten Dokument, weil ein Link auf 16 Ziffern
          AGB niemand vor dem Bezahlen liest. */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
        <p>
          Das Abo verlängert sich automatisch um {gewaehlt === "monat" ? "einen Monat" : "zwölf Monate"},
          bis du kündigst. Kündigen kannst du jederzeit ohne Frist in deinem Profil — Premium läuft
          dann bis zum Ende der bezahlten Periode weiter.
        </p>
        <p>
          Nicht zufrieden? Innerhalb von 14 Tagen nach dem ersten Abschluss bekommst du den Betrag
          auf formlose Anfrage zurück. Das ist eine freiwillige Zusage, kein gesetzliches
          Widerrufsrecht.
        </p>
        <p>
          Es gelten die{" "}
          <a href={LEGAL_URLS.agb} target="_blank" rel="noopener noreferrer" className="underline">
            AGB
          </a>{" "}
          und die{" "}
          <a
            href={LEGAL_URLS.datenschutz}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Datenschutzerklärung
          </a>
          .
        </p>
      </div>

      {/* key auf dem Plan: wechselt die Wahl, muss ein bereits vorbereitetes
          Payment Element verworfen werden — sonst zahlte man den Betrag des
          zuvor gewählten Plans. */}
      <PremiumCheckoutForm
        key={gewaehlt}
        plan={gewaehlt}
        beworbenerPreis={aktiv.betragRappen}
        onSuccess={() => router.push("/profil")}
      />
    </div>
  );
}

function PlanOption({
  angebot,
  gewaehlt,
  onWaehlen,
}: {
  angebot: PlanAngebot;
  gewaehlt: boolean;
  onWaehlen: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg border px-4 py-3 ${
        gewaehlt ? "border-foreground bg-surface" : "border-border"
      }`}
    >
      <span className="flex items-center gap-3">
        <input
          type="radio"
          name="plan"
          value={angebot.plan}
          checked={gewaehlt}
          onChange={onWaehlen}
          className="accent-foreground"
        />
        <span className="text-sm font-medium text-foreground">{planTitel(angebot.plan)}</span>
      </span>
      <span className="text-right text-sm">
        {angebot.istGruenderpreis && angebot.regulaerRappen !== null && (
          <span className="mr-2 text-muted line-through">
            {preis(angebot.regulaerRappen, angebot.waehrung)}
          </span>
        )}
        <span className="font-medium text-foreground">
          {preis(angebot.betragRappen, angebot.waehrung)}
        </span>{" "}
        <span className="text-muted">{planZeitraum(angebot.plan)}</span>
      </span>
    </label>
  );
}
