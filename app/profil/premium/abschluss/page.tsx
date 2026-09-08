import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { getCurrentUser } from "@/lib/supabase/server";
import { confirmCheckoutSession, confirmSubscription } from "@/lib/actions/billing";
import { buttonVariants } from "@/components/ui/Button";

// Rückweg für Zahlungsarten mit Weiterleitung.
//
// Kartenzahlungen werden im Payment Element ohne Seitenwechsel bestätigt
// (redirect: "if_required"). TWINT und einige Bankverfahren führen die
// zahlende Person dagegen zur Bank oder in die Banking-App und danach an
// die return_url zurück — hierher.
//
// Diese Seite ist deshalb kein Beiwerk, sondern der einzige Weg zurück in
// die Anwendung für genau die Zahlungsart, die für ein Schweizer Produkt am
// wichtigsten ist.
export const dynamic = "force-dynamic";

export default async function PremiumAbschlussPage({
  searchParams,
}: {
  searchParams: Promise<{ sitzung?: string; abo?: string }>;
}) {
  const { sitzung, abo } = await searchParams;

  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");

  // Beide Bestätigungen prüfen den Zustand bei Stripe nach und stellen
  // insbesondere sicher, dass Session bzw. Abo dem eigenen Customer gehören
  // — die ID kommt aus der Adresszeile und ist damit eine Nutzereingabe.
  // Ohne diese Prüfung liesse sich mit einer fremden ID Premium für das
  // eigene Konto einschalten (siehe lib/actions/billing.ts).
  //
  // ?abo= ist der Übergangsparameter aus dem vorherigen
  // Payment-Intent-Fluss: wer eine Weiterleitungs-Zahlung begonnen hat,
  // bevor die Umstellung ausgeliefert wurde, kehrt mit dieser Adresse
  // zurück. Zusammen mit confirmSubscription entfernen, sobald keine solche
  // Zahlung mehr unterwegs sein kann.
  let bestaetigt = false;
  if (sitzung) bestaetigt = await confirmCheckoutSession(sitzung);
  else if (abo) bestaetigt = await confirmSubscription(abo);

  if (bestaetigt) redirect("/profil");

  // Nicht bestätigt heisst nicht "fehlgeschlagen": bei TWINT dauert die
  // Verbuchung mitunter einige Sekunden, und der Webhook zieht den Zustand
  // ohnehin nach. Deshalb kein Fehlerbild, sondern ein Zwischenstand mit
  // einem Weg weiter — und ausdrücklich der Hinweis, dass nichts doppelt
  // abgebucht wird, weil genau das die Sorge in diesem Moment ist.
  const nochmal = sitzung
    ? `/profil/premium/abschluss?sitzung=${encodeURIComponent(sitzung)}`
    : abo
      ? `/profil/premium/abschluss?abo=${encodeURIComponent(abo)}`
      : "/profil";

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-5 py-8 sm:px-6">
        <h1 className="text-display font-semibold">Zahlung wird noch geprüft</h1>
        <p className="text-sm text-muted">
          Deine Zahlung ist unterwegs, aber noch nicht bestätigt. Bei TWINT dauert das manchmal
          einen Moment. Lade diese Seite in ein paar Sekunden neu — abgebucht wird nichts doppelt.
        </p>
        <p className="text-sm text-muted">
          Bleibt es dabei, findest du deinen Abo-Zustand jederzeit in deinem Profil.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={nochmal} className={buttonVariants({ variant: "primary", size: "sm" })}>
            Erneut prüfen
          </Link>
          <Link href="/profil" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Zum Profil
          </Link>
        </div>
      </main>
    </div>
  );
}
