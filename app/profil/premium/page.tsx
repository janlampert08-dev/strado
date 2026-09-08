import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PremiumPurchaseView from "@/components/PremiumPurchaseView";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumAngebot } from "@/lib/actions/billing";
import { getPremiumStatus } from "@/lib/premium";

// Die Preise kommen bei jedem Aufruf frisch aus Stripe — ein im Dashboard
// geänderter Preis darf nicht als zwischengespeicherte Zahl weiterlaufen.
export const dynamic = "force-dynamic";

export const metadata = { title: "Premium – Strado" };

export default async function PremiumPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");

  // Wer schon Premium hat, hat hier nichts zu suchen — das Abo verwaltet er
  // über das Kundenportal auf der Profilseite. Ein zweiter Abschluss würde
  // in createSubscriptionIntent ohnehin abgewiesen, aber eine Kaufseite, die
  // gar nicht erst erscheint, ist die klarere Antwort.
  const status = await getPremiumStatus();
  if (status.aktiv) redirect("/profil");

  const angebot = await getPremiumAngebot();

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
        <PremiumPurchaseView angebot={angebot} />
      </main>
    </div>
  );
}
