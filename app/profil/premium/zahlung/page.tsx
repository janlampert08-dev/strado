import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Card from "@/components/ui/Card";
import { CreditCard, Scale, SparklesIcon } from "@/components/NavIcons";
import SectionHeading from "@/components/ui/SectionHeading";
import PremiumBadge from "@/components/PremiumBadge";
import PremiumCheckoutForm from "@/components/PremiumCheckoutForm";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumAngebot } from "@/lib/actions/billing";
import { getPremiumStatus, kaufseiteOffen } from "@/lib/premium";
import { LEGAL_URLS } from "@/lib/constants";
import { betragText, planTitel, planZeitraum } from "@/lib/premiumAngebot";
import { datumCH } from "@/lib/format";
import { SAISONPASS_MONATE, TESTPHASE_TAGE, type AboPlan } from "@/lib/premiumLimits";

// Wie die Kaufseite: der Preis kommt bei jedem Aufruf frisch aus Stripe.
export const dynamic = "force-dynamic";

export const metadata = { title: "Zahlung – Strado" };

function istAboPlan(wert: string | undefined): wert is AboPlan {
  return wert === "monat" || wert === "jahr" || wert === "saisonpass";
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
  // app/profil/premium/page.tsx. Eine Ausnahme seit 0110: mit einem
  // laufenden Saisonpass darf ein Abo abgeschlossen werden, das erst mit
  // dem Passende zu zahlen beginnt (und ein neuer Pass kurz vor Ablauf).
  // Seit 0135 ebenso mit dem Gratis-Premium aus dem Signup-Link.
  if (!kaufseiteOffen(status)) redirect("/profil");

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

  // Beides kommt aus getPremiumAngebot() und damit vom Server: ob diesem
  // Konto die Testphase zusteht und ob ein Saisonpass läuft, an den ein Abo
  // anschliesst. Die endgültige Entscheidung fällt beim Anlegen der Session
  // (lib/actions/billing.ts) — hier steuert es nur, welche Pflichtangaben
  // dastehen.
  const testphase = gewaehlt.plan === "jahr" && angebot.testphaseMoeglich;
  const passBis = angebot.saisonpassBis ? new Date(angebot.saisonpassBis) : null;

  return (
    // Diese Seite scrollt als Dokument statt in einem eigenen
    // Scroll-Container — anders als der Rest der App, wo aussen h-dvh steht
    // und <main> die Scrollfläche ist. Der Grund ist das Payment Element:
    // es rendert in einem fremden iframe, und eine Wischgeste, die auf einem
    // iframe beginnt, reicht ihren Scroll in WebKit nicht an ein
    // darüberliegendes overflow-Element weiter, sondern nur an den
    // Dokument-Scroller. Solange bloss die zwei Zahlungsart-Reiter zu sehen
    // sind, fällt das nicht auf; sobald eine Zahlungsart gewählt ist, füllt
    // das iframe mit Kartennummer, Ablaufdatum und Prüfziffer den halben
    // Bildschirm — und damit landete fast jeder Wisch auf einer Fläche, die
    // die Seite nicht bewegte. Genau das war hier zu sehen.
    //
    // Der zweite Effekt desselben Wechsels: ein Dokument, das nie scrollt,
    // lässt die Adresszeile in Safari auch nie einklappen. Das höchste
    // Formular der App stand damit ausgerechnet auf der kleinsten Variante
    // des Viewports.
    //
    // min-h-dvh statt h-dvh, damit die Spalte bei kurzem Inhalt weiterhin
    // den Bildschirm füllt. Header (sticky) und BottomNav (fixed) stehen
    // unverändert; den Platz unter der Leiste reserviert nach wie vor die
    // globale main{padding-bottom}-Regel in globals.css.
    <div className="flex min-h-dvh flex-col">
      <Header back="/profil/premium" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-8 sm:px-6">
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
          <SectionHeading icon={SparklesIcon}>Deine Auswahl</SectionHeading>
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
            dem Formular, das die Zahlungspflicht auslöst.

            Drei Pläne, drei verschiedene Pflichtangaben, und der Unterschied
            ist nicht Kosmetik: beim Saisonpass gibt es keine Verlängerung
            und damit auch keine Kündigung, bei der Testphase entscheidet
            das Datum darüber, ob überhaupt etwas abgebucht wird. Ein Text,
            der für alles zugleich gälte, wäre für jeden Fall ein bisschen
            falsch. */}
        <section className="flex flex-col gap-3">
          <SectionHeading icon={Scale}>Bevor du bestätigst</SectionHeading>
          <Card surface className="flex flex-col gap-2 px-4 py-3 text-sm text-muted">
            {gewaehlt.plan === "saisonpass" ? (
              <p>
                Einmalige Zahlung für {SAISONPASS_MONATE} Monate Premium ab heute. Der Saisonpass
                verlängert sich nicht und muss nicht gekündigt werden — nach {SAISONPASS_MONATE}{" "}
                Monaten läuft er einfach aus.
                {passBis && (
                  <>
                    {" "}
                    Dein laufender Pass gilt bis {datumCH(passBis)}; der neue schliesst daran an.
                  </>
                )}
              </p>
            ) : (
              <>
                {testphase && (
                  <p>
                    Die ersten {TESTPHASE_TAGE} Tage sind gratis. Kündigst du innerhalb dieser Zeit,
                    wird nichts abgebucht.
                  </p>
                )}
                {passBis && (
                  <p>
                    Die erste Zahlung wird am {datumCH(passBis)} fällig — dann endet dein
                    Saisonpass. Bis dahin läuft Premium über den Pass weiter.
                  </p>
                )}
                <p>
                  Das Abo verlängert sich {testphase || passBis ? "danach " : ""}automatisch um{" "}
                  {gewaehlt.plan === "monat" ? "einen Monat" : "zwölf Monate"}, bis du kündigst.
                  Kündigen kannst du jederzeit ohne Frist in deinem Profil. Premium läuft danach bis
                  zum Ende der bezahlten Periode weiter.
                </p>
              </>
            )}
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
          <SectionHeading icon={CreditCard}>Zahlungsdaten</SectionHeading>
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
