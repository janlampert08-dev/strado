import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PremiumCard from "@/components/PremiumCard";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/premium";

// Der Abo-Zustand kommt aus der Datenbank (Webhook/Reconciliation-Cron
// halten sie aktuell), nicht live von Stripe — dieselbe Quelle wie
// PremiumCard auf der Profilseite. Trotzdem dynamisch: eine gerade erst
// zurückgekehrte Kündigung oder ein frisch abgeschlossenes Abo soll ohne
// zwischengespeicherte Antwort sichtbar sein.
export const dynamic = "force-dynamic";

export const metadata = { title: "Abo verwalten – Strado" };

// Eigene Seite statt eines Abschnitts auf der Einstellungsseite, damit sich
// von dort aus gezielt dorthin verlinken lässt — Rechnung, Kündigung und
// Zahlungsmittel-Wechsel bleiben Stripes gehostetes Kundenportal (siehe
// createPortalSession in lib/actions/billing.ts): eine eigene Nachbildung
// davon lohnt sich nicht, dieselbe Abwägung wie dort.
export default async function AboVerwaltenPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");

  const status = await getPremiumStatus();

  // Ohne Abo gibt es hier nichts zu verwalten. Statt einer Seite mit dem
  // Titel "Abo verwalten", die in Wahrheit für Premium wirbt, geht es
  // direkt auf die Kaufseite — dieselbe Stelle, auf die die Profilseite
  // ohne Abo führt. Der Einstellungsabschnitt, der hierher verlinkt, ist
  // ohne Abo ohnehin ausgeblendet; diese Prüfung fängt den direkten Aufruf
  // der Adresse ab.
  if (!status.aktiv) redirect("/profil/premium");

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil/einstellungen" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-5 py-8 sm:px-6 sm:py-10 lg:max-w-3xl">
        <h1 className="text-display font-semibold">Abo verwalten</h1>
        <PremiumCard status={status} />
      </main>
    </div>
  );
}
