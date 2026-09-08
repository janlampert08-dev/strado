import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Card from "@/components/ui/Card";
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
export default async function PremiumZahlungPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; preis?: string }>;
}) {
  // Parallel wie auf der Kaufseite: vier Wartezeiten hintereinander
  // (searchParams, Auth, Datenbank, Stripe) waren auf dem Weg zum
  // Bezahlformular die Hälfte der gefühlten Ladezeit — und keine davon
  // braucht das Ergebnis der vorherigen.
  const [{ plan, preis }, user, status, angebot] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getPremiumStatus(),
    getPremiumAngebot(),
  ]);

  if (!user) redirect("/anmelden");

  // Wer schon Premium hat, hat hier nichts zu suchen — siehe
  // app/profil/premium/page.tsx.
  if (status.aktiv) redirect("/profil");

  if (!istAboPlan(plan)) redirect("/profil/premium");

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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-5 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-display font-semibold">Zahlung abschliessen</h1>
          <p className="text-sm text-muted">
            {planTitel(gewaehlt.plan)} — {betragText(gewaehlt.betragRappen, gewaehlt.waehrung)}{" "}
            {planZeitraum(gewaehlt.plan)}
          </p>
        </div>

        {/* Die Pflichtangaben vor dem Kauf, nicht danach: automatische
            Verlängerung, Kündigungsweg, Widerrufslage. Sie stehen hier im
            Text und nicht nur im verlinkten Dokument, weil ein Link auf 16
            Ziffern AGB niemand vor dem Bezahlen liest — und unmittelbar über
            dem Formular, das die Zahlungspflicht auslöst. */}
        <Card surface className="flex flex-col gap-2 px-4 py-3 text-sm text-muted">
          <p>
            Das Abo verlängert sich automatisch um{" "}
            {gewaehlt.plan === "monat" ? "einen Monat" : "zwölf Monate"}, bis du kündigst. Kündigen
            kannst du jederzeit ohne Frist in deinem Profil. Premium läuft danach bis zum Ende der
            bezahlten Periode weiter.
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

        {/* key auf dem Plan: käme jemand über die Zurück-Schaltfläche mit
            einem anderen Plan zurück auf diese Seite, muss ein bereits
            vorbereitetes Payment Element verworfen werden — sonst zahlte man
            den Betrag des zuvor gewählten Plans. */}
        <PremiumCheckoutForm key={gewaehlt.plan} plan={gewaehlt.plan} beworbenerPreis={beworbenerPreis} />
      </main>
    </div>
  );
}
