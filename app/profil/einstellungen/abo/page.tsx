import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PremiumCard from "@/components/PremiumCard";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/premium";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

// Der Abo-Zustand kommt aus der Datenbank (Webhook/Reconciliation-Cron
// halten sie aktuell), nicht live von Stripe — dieselbe Quelle, aus der
// die Profilseite entscheidet, ob sie den Kauf-Einstieg zeigt. Trotzdem
// dynamisch: eine gerade erst zurückgekehrte Kündigung oder ein frisch
// abgeschlossenes Abo soll ohne zwischengespeicherte Antwort sichtbar sein.
export const dynamic = "force-dynamic";

export const metadata = { title: "Abo verwalten – Strado" };

// Eigene Seite statt eines Abschnitts auf der Einstellungsseite, damit sich
// von dort aus gezielt dorthin verlinken lässt — Rechnung, Kündigung und
// Zahlungsmittel-Wechsel bleiben Stripes gehostetes Kundenportal (siehe
// createPortalSession in lib/actions/billing.ts): eine eigene Nachbildung
// davon lohnt sich nicht, dieselbe Abwägung wie dort.
//
// Für Abonnenten ist das die einzige Stelle mit "Abo verwalten": die
// Profilseite zeigt die Karte nur noch ohne Abo (Kauf-Einstieg).
export default async function AboVerwaltenPage({
  searchParams,
}: {
  // ?portal=fehler setzt createPortalSession, wenn Stripe das Kundenportal
  // nicht öffnen konnte.
  searchParams: Promise<{ portal?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");

  const [status, { portal }] = await Promise.all([getPremiumStatus(), searchParams]);

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
      <Seitenrahmen className="flex-1 overflow-y-auto">
        <h1 className="text-display font-semibold">Abo verwalten</h1>
        {portal === "fehler" && (
          <p role="alert" className="text-sm text-danger">
            Die Aboverwaltung liess sich gerade nicht öffnen. Versuch es in ein paar Minuten
            nochmals — klappt es dann immer noch nicht, schreib uns an contact@strado.ch.
          </p>
        )}
        <PremiumCard status={status} />
      </Seitenrahmen>
    </div>
  );
}
