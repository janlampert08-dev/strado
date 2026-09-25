import type { Metadata } from "next";
import Link from "next/link";
import { Check, SparklesIcon } from "@/components/NavIcons";
import Header from "@/components/Header";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import SectionHeading from "@/components/ui/SectionHeading";
import PremiumBadge from "@/components/PremiumBadge";
import { buttonVariants } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumStatus, kaufseiteOffen } from "@/lib/premium";
import { datumCH } from "@/lib/format";
import { getOeffentlichesAngebot } from "@/lib/actions/billing";
import { saisonpassImWinter } from "@/lib/saisonpassSaison";
import SaisonpassWinterHinweis from "@/components/SaisonpassWinterHinweis";
import { getOrigin } from "@/lib/utils/url";
import {
  betragText,
  jahresVorteilProzent,
  monatsAequivalentRappen,
  planTitel,
  planZeitraum,
  saisonpassMonatsAequivalentRappen,
} from "@/lib/premiumAngebot";
import { SAISONPASS_MONATE } from "@/lib/premiumLimits";
import { PREMIUM_VORTEILE } from "@/lib/premiumVorteile";
import type { AboPlan } from "@/lib/premiumLimits";

// Öffentliche Teaser-Seite: dieselben Preise wie die Kasse (aus Stripe, nie
// aus einer zweiten Liste), aber ohne Personenbezug — keine Testphase, kein
// Saisonpass-Stand. Wer angemeldet ist und noch kein Premium hat, geht von
// hier zur Kaufseite; wer Premium hat, zurück ins Profil.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Premium – Strado",
  description:
    "Strado Premium: Wetterfenster, Pass-Sammlung mit Saisonrückblick und Wartungsheft. Entdecken, Aufzeichnen, Ranglisten, Feed und Passstatus bleiben gratis.",
  alternates: { canonical: "/premium" },
};

const REIHENFOLGE: AboPlan[] = ["jahr", "saisonpass", "monat"];

export default async function PremiumTeaserPage() {
  const [user, status, plaene, origin] = await Promise.all([
    getCurrentUser(),
    getPremiumStatus(),
    getOeffentlichesAngebot().catch(() => []),
    getOrigin(),
  ]);

  // Wer Premium hat, das von selbst endet (Saisonpass, Gratis-Premium aus
  // dem Signup-Link), geht wie ein Konto ohne Premium zur Kaufseite —
  // dieselbe Regel wie dort (kaufseiteOffen).
  const hatPremium = !kaufseiteOffen(status);
  const gratisBis = status.quelle === "gratis" ? status.gratisBis : null;
  const winter = saisonpassImWinter();
  const sortiert = REIHENFOLGE.map((plan) => plaene.find((p) => p.plan === plan)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );
  // Dieselbe Einordnung wie auf der Kaufseite (components/PremiumPurchaseView
  // .tsx): Prozent-Abzeichen am Jahresplan und das Monatsäquivalent als
  // Nebenzeile. Bisher standen hier nur die nackten Beträge — CHF 39.00 pro
  // Jahr neben CHF 6.90 pro Monat, und die Rechnung, dass das Jahr weniger
  // als die Hälfte kostet, blieb der Leserin überlassen. Auf der Seite, die
  // Nicht-Kunden als erste sehen.
  const vorteilProzent = jahresVorteilProzent(
    plaene.find((p) => p.plan === "monat"),
    plaene.find((p) => p.plan === "jahr"),
  );

  // Strukturierte Daten für das öffentliche Angebot. Die Preise kommen aus
  // derselben Stripe-Abfrage wie die sichtbare Preisliste oben (keine zweite
  // Liste — Preisbekanntgabeverordnung, siehe getOeffentlichesAngebot), und
  // die Beschreibung ist der sichtbare Einleitungssatz wörtlich. Fällt die
  // Preisabfrage aus, entfällt der Block mit ihr, statt alte Zahlen zu
  // behaupten.
  const strukturierteDaten = {
    "@context": "https://schema.org",
    "@type": "Product",
    inLanguage: "de-CH",
    name: "Strado Premium",
    description:
      "Deine Strecken ins Navi, das Wetterfenster für die Woche, jeder Pass, den du hattest, und ein Wartungsheft, das mitzählt.",
    brand: { "@type": "Brand", name: "Strado" },
    offers: sortiert.map((p) => ({
      "@type": "Offer",
      name: `Strado Premium ${planTitel(p.plan)}`,
      price: p.betragRappen / 100,
      priceCurrency: p.waehrung.toUpperCase(),
      url: `${origin}/profil/premium`,
      availability: "https://schema.org/InStock",
    })),
  };

  const ctaHref = hatPremium
    ? "/profil"
    : user
      ? "/profil/premium"
      : `/anmelden?next=${encodeURIComponent("/profil/premium")}`;
  const ctaText = hatPremium
    ? "Zum Profil"
    : gratisBis
      ? "Jetzt sichern"
      : user
        ? "Premium wählen"
        : "Anmelden, um Premium zu wählen";

  return (
    <div className="flex min-h-dvh flex-col">
      {sortiert.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(strukturierteDaten)
              .replace(/</g, "\\u003c")
              .replace(/>/g, "\\u003e")
              .replace(/&/g, "\\u0026"),
          }}
        />
      )}
      <Header back="/" />
      <Seitenrahmen breite="schmal">
        <div className="flex flex-col gap-3">
          <PremiumBadge />
          <h1 className="text-display font-semibold">Mehr aus jeder Saison</h1>
          <p className="text-sm text-muted">
            Deine Strecken ins Navi, das Wetterfenster für die Woche, jeder Pass, den du hattest,
            und ein Wartungsheft, das mitzählt. Entdecken, Aufzeichnen, Ranglisten und Feed bleiben
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

        {sortiert.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeading icon={SparklesIcon}>Pläne</SectionHeading>
            <ul className="flex flex-col gap-2">
              {sortiert.map((p) => (
                <li
                  key={p.plan}
                  className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {planTitel(p.plan)}
                      </span>
                      {p.plan === "jahr" && vorteilProzent !== null && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
                          {vorteilProzent} % günstiger
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-baseline justify-end gap-x-2">
                      <span className="text-title font-semibold text-foreground">
                        {betragText(p.betragRappen, p.waehrung)}
                      </span>
                      <span className="text-sm text-muted">{planZeitraum(p.plan)}</span>
                    </span>
                  </span>
                  {p.plan === "jahr" && (
                    <span className="text-xs text-muted">
                      entspricht {betragText(monatsAequivalentRappen(p.betragRappen), p.waehrung)}{" "}
                      pro Monat
                    </span>
                  )}
                  {p.plan === "saisonpass" && (
                    <span className="text-xs text-muted">
                      {SAISONPASS_MONATE} Monate ab Kauf, verlängert sich nicht · entspricht{" "}
                      {betragText(saisonpassMonatsAequivalentRappen(p.betragRappen), p.waehrung)}{" "}
                      pro Monat
                    </span>
                  )}
                  {/* Oktober bis Februar: dieselben Sätze wie auf der Kaufseite
                      (lib/saisonpassSaison.ts). */}
                  {p.plan === "saisonpass" && winter && <SaisonpassWinterHinweis />}
                  {p.plan === "jahr" && winter && (
                    <span className="text-xs text-muted">
                      Empfohlen im Winter: läuft über die ganze nächste Saison.
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              Bezahlen mit TWINT oder Karte · Endpreise in CHF · Kündigung im Kundenportal
            </p>
          </section>
        )}

        {gratisBis && (
          <p className="text-sm text-muted">
            Premium gratis bis {datumCH(gratisBis)}. Danach läuft es ohne Abo einfach aus.
          </p>
        )}

        <Link href={ctaHref} className={buttonVariants({ className: "w-full" })}>
          {ctaText}
        </Link>
      </Seitenrahmen>
    </div>
  );
}
