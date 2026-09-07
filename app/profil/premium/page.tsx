import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PremiumPurchaseView from "@/components/PremiumPurchaseView";
import { createClient } from "@/lib/supabase/server";
import { getPremiumAngebot } from "@/lib/actions/billing";
import { getPremiumStatus } from "@/lib/premium";

// Die Preise kommen bei jedem Aufruf frisch aus Stripe — ein im Dashboard
// geänderter Preis darf nicht als zwischengespeicherte Zahl weiterlaufen.
export const dynamic = "force-dynamic";

export default async function PremiumPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 overflow-y-auto px-5 py-8 sm:px-6">
        <PremiumPurchaseView angebot={angebot} />
      </main>
    </div>
  );
}
