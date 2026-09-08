import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PremiumPurchaseView from "@/components/PremiumPurchaseView";
import { createClient } from "@/lib/supabase/server";
import { getPremiumAngebot } from "@/lib/actions/billing";
import { getPremiumStatus } from "@/lib/premium";

// Die Preise kommen bei jedem Aufruf frisch aus Stripe — ein im Dashboard
// geänderter Preis darf nicht als zwischengespeicherte Zahl weiterlaufen.
export const dynamic = "force-dynamic";

export const metadata = { title: "Premium – Strado" };

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
      {/* Scroll-Container ist der volle Rest der Seitenbreite, nicht das
          zentrierte max-w-Element darin (wie app/profil/page.tsx): sass
          overflow-y-auto auf dem <main>, klebte die Browser-Scrollbar am
          Rand der Inhaltsspalte statt am Viewport-Rand, sobald das Fenster
          breiter als max-w war.

          Kein justify-center: der Inhalt ist höher als ein Telefonbildschirm,
          und zentrierter Flex-Inhalt in einem scrollenden Container lässt
          sich am oberen Rand nicht mehr erreichen — die Überschrift wäre
          abgeschnitten und unerreichbar. Etwas breiter als die
          Formularseiten, weil die Planauswahl Preis, Abzeichen und
          Zusatzzeile nebeneinander trägt. Das padding-bottom aus globals.css
          (< md) sitzt weiterhin auf <main>, also am Ende des gescrollten
          Inhalts — genau dort hält es das letzte Element über der BottomNav. */}
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-5 py-8 sm:px-6">
          <PremiumPurchaseView angebot={angebot} />
        </main>
      </div>
    </div>
  );
}
