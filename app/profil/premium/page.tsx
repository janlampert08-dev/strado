import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PremiumPurchaseView from "@/components/PremiumPurchaseView";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumAngebot } from "@/lib/actions/billing";
import { getPremiumStatus, kaufseiteOffen } from "@/lib/premium";

// Die Preise kommen bei jedem Aufruf frisch aus Stripe — ein im Dashboard
// geänderter Preis darf nicht als zwischengespeicherte Zahl weiterlaufen.
export const dynamic = "force-dynamic";

export const metadata = { title: "Premium – Strado" };

export default async function PremiumPage() {
  // Alle drei parallel: die Preise aus Stripe hängen nicht am Nutzer, und
  // getPremiumStatus holt den Nutzer über denselben cache()-Aufruf wie
  // getCurrentUser. Nacheinander waren das drei Wartezeiten hintereinander
  // (Auth, Datenbank, Stripe), von denen nur die letzte unvermeidbar ist.
  const [user, status, angebot] = await Promise.all([
    getCurrentUser(),
    getPremiumStatus(),
    getPremiumAngebot(),
  ]);

  if (!user) redirect("/anmelden");

  // Wer schon Premium hat, hat hier nichts zu suchen — das Abo verwaltet er
  // über das Kundenportal auf der Profilseite. Ein zweiter Abschluss würde
  // in createCheckoutSession ohnehin abgewiesen, aber eine Kaufseite, die
  // gar nicht erst erscheint, ist die klarere Antwort.
  //
  // Seit 0110 mit einer Ausnahme: ein Saisonpass läuft aus, ohne dass
  // irgendetwas daran erinnert. Wer einen hat, darf hier ein Abo
  // abschliessen (es zahlt erst ab dem Passende) oder den Pass kurz vor
  // Ablauf verlängern. Ihn wegzuschicken hiesse, den einzigen Weg zurück zu
  // schliessen.
  //
  // Seit 0135 dieselbe Ausnahme für das Gratis-Premium aus dem Signup-Link:
  // es endet nach sieben Tagen von selbst, und wer in dieser Zeit kaufen
  // will, soll es können (kaufseiteOffen in lib/premiumLimits.ts).
  if (!kaufseiteOffen(status)) redirect("/profil");

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      {/* Kein justify-center: der Inhalt dieser Seite ist höher als ein
          Telefonbildschirm, und ein zentrierter Flex-Inhalt in einem
          scrollenden Container lässt sich am oberen Rand nicht mehr
          erreichen — die Überschrift wäre abgeschnitten und unerreichbar.
          Etwas breiter als die Formularseiten, weil die Planauswahl Preis,
          Abzeichen und Zusatzzeile nebeneinander trägt. */}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 overflow-y-auto px-5 py-8 sm:px-6">
        <PremiumPurchaseView
          angebot={angebot}
          gratisBis={status.gratisBis ? status.gratisBis.toISOString() : null}
        />
      </main>
    </div>
  );
}
