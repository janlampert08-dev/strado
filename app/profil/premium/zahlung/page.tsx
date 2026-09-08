import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import PremiumBadge from "@/components/PremiumBadge";
import PremiumCheckoutForm from "@/components/PremiumCheckoutForm";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumAngebot } from "@/lib/actions/billing";
import { getPremiumStatus } from "@/lib/premium";
import { LEGAL_URLS } from "@/lib/constants";
import { betragText, planTitel, planZeitraum } from "@/lib/premiumAngebot";
import type { AboPlan } from "@/lib/premiumLimits";

// Wie die Kaufseite: der Preis kommt bei jedem Aufruf frisch aus Stripe.
export const dynamic = "force-dynamic";

export const metadata = { title: "Zahlung – Strado" };

function istAboPlan(wert: string | undefined): wert is AboPlan {
  return wert === "monat" || wert === "jahr";
}

// Eigene Seite fürs Bezahlformular, erreichbar nur über die Kaufseite
// (components/PremiumPurchaseView.tsx), die den gewählten Plan als
// Query-Parameter mitgibt. Getrennt von der Planauswahl, damit das
// Formular — inklusive Stripe-Skript und -Iframe — nicht schon lädt, wer
// die Kaufseite nur ansieht.
//
// Gebaut wie die Kaufseite, weil es derselbe Kauf ist: Premium-Pille über
// der Überschrift, darunter drei mit SectionHeading beschriftete
// Abschnitte. Vorher stand hier eine Überschrift, eine graue Zeile und
// zwei unbeschriftete Blöcke — der Schritt sah aus wie ein anderer
// Bereich der App, obwohl er nur einen Klick hinter der Planauswahl liegt.
export default async function PremiumZahlungPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; preis?: string }>;
}) {
  const { plan, preis } = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");

  // Wer schon Premium hat, hat hier nichts zu suchen — siehe
  // app/profil/premium/page.tsx.
  const status = await getPremiumStatus();
  if (status.aktiv) redirect("/profil");

  if (!istAboPlan(plan)) redirect("/profil/premium");

  const angebot = await getPremiumAngebot();
  const gewaehlt = angebot.plaene.find((p) => p.plan === plan);
  // Der Plan aus der Adresszeile existiert im aktuellen Angebot nicht (mehr)
  // — zurück zur Auswahl statt einer Seite ohne Preis und ohne Formular.
  if (!gewaehlt) redirect("/profil/premium");

  // preis ist nur der Anzeigewert vom Laden der Kaufseite (Query-Parameter,
  // also Nutzereingabe) — für die Übergangsmeldung in PremiumCheckoutForm,
  // falls sich der Preis seither geändert hat. Abgebucht wird ohnehin, was
  // Stripe der Checkout-Session tatsächlich zuweist, nie dieser Wert. Fehlt
  // er oder ist er unbrauchbar, fällt er auf den aktuellen Katalogpreis
  // zurück — dann bleibt der Hinweis auf eine Preisänderung einfach aus.
  const beworbenerPreisRappen = Number(preis);
  const beworbenerPreis =
    Number.isFinite(beworbenerPreisRappen) && beworbenerPreisRappen > 0
      ? beworbenerPreisRappen
      : gewaehlt.betragRappen;

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil/premium" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 overflow-y-auto px-5 py-8 sm:px-6">
        <div className="flex flex-col gap-3">
          <PremiumBadge />
          <h1 className="text-display font-semibold">Zahlung abschliessen</h1>
        </div>

        {/* Der gewählte Plan in derselben Zeile, in der er auf der Kaufseite
            ausgewählt wurde (PlanOption): Titel, grosser Betrag, Zeitraum
            daneben. Vorher stand das als eine graue Zeile unter der
            Überschrift — der Betrag, den man gleich zahlt, war der kleinste
            Text auf der Seite. */}
        <section className="flex flex-col gap-3">
          <SectionHeading>Deine Auswahl</SectionHeading>
          <Card className="flex flex-col gap-1 px-4 py-3.5">
            <span className="text-sm font-semibold text-foreground">
              {planTitel(gewaehlt.plan)}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-title font-semibold text-foreground">
                {betragText(gewaehlt.betragRappen, gewaehlt.waehrung)}
              </span>
              <span className="text-sm text-muted">{planZeitraum(gewaehlt.plan)}</span>
            </span>
          </Card>
        </section>

        {/* Die Pflichtangaben vor dem Kauf, nicht danach: automatische
            Verlängerung, Kündigungsweg, Widerrufslage. Sie stehen hier im
            Text und nicht nur im verlinkten Dokument, weil ein Link auf 16
            Ziffern AGB niemand vor dem Bezahlen liest — und unmittelbar über
            dem Formular, das die Zahlungspflicht auslöst. */}
        <section className="flex flex-col gap-3">
          <SectionHeading>Bevor du bestätigst</SectionHeading>
          <Card surface className="flex flex-col gap-2 px-4 py-3 text-sm text-muted">
            <p>
              Das Abo verlängert sich automatisch um{" "}
              {gewaehlt.plan === "monat" ? "einen Monat" : "zwölf Monate"}, bis du kündigst.
              Kündigen kannst du jederzeit ohne Frist in deinem Profil. Premium läuft danach bis
              zum Ende der bezahlten Periode weiter.
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
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeading>Zahlungsdaten</SectionHeading>
          {/* key auf dem Plan: käme jemand über die Zurück-Schaltfläche mit
              einem anderen Plan zurück auf diese Seite, muss ein bereits
              vorbereitetes Payment Element verworfen werden — sonst zahlte
              man den Betrag des zuvor gewählten Plans. */}
          <PremiumCheckoutForm
            key={gewaehlt.plan}
            plan={gewaehlt.plan}
            beworbenerPreis={beworbenerPreis}
          />
        </section>
      </main>
    </div>
  );
}
