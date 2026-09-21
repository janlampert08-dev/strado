import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import Header from "@/components/Header";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import SectionHeading from "@/components/ui/SectionHeading";
import PremiumBadge from "@/components/PremiumBadge";
import { buttonVariants } from "@/components/ui/Button";
import { SparklesIcon } from "@/components/NavIcons";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/premium";
import { getOeffentlichesAngebot } from "@/lib/actions/billing";
import { betragText, planTitel, planZeitraum } from "@/lib/premiumAngebot";
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
  const [user, status, plaene] = await Promise.all([
    getCurrentUser(),
    getPremiumStatus(),
    getOeffentlichesAngebot().catch(() => []),
  ]);

  const hatPremium = status.aktiv && status.quelle !== "saisonpass";
  const sortiert = REIHENFOLGE.map((plan) => plaene.find((p) => p.plan === plan)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );

  const ctaHref = hatPremium
    ? "/profil"
    : user
      ? "/profil/premium"
      : `/anmelden?next=${encodeURIComponent("/profil/premium")}`;
  const ctaText = hatPremium ? "Zum Profil" : user ? "Premium wählen" : "Anmelden und Premium wählen";

  return (
    <div className="flex min-h-dvh flex-col">
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
          <SectionHeading icon={SparklesIcon}>Was Premium dazugibt</SectionHeading>
          <ul className="flex flex-col gap-2.5 text-sm text-foreground">
            {PREMIUM_VORTEILE.map((vorteil) => (
              <li key={vorteil} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
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
                  className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <span className="text-sm font-semibold text-foreground">{planTitel(p.plan)}</span>
                  <span className="flex flex-wrap items-baseline justify-end gap-x-2">
                    <span className="text-title font-semibold text-foreground">
                      {betragText(p.betragRappen, p.waehrung)}
                    </span>
                    <span className="text-sm text-muted">{planZeitraum(p.plan)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              Bezahlen mit TWINT oder Karte · Preise in CHF inkl. MWST · Kündigung im Kundenportal
            </p>
          </section>
        )}

        <Link href={ctaHref} className={buttonVariants({ className: "w-full" })}>
          {ctaText}
        </Link>
      </Seitenrahmen>
    </div>
  );
}
