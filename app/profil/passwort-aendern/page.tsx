import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PasswortAendernForm from "@/components/PasswortAendernForm";
import { getCurrentUser } from "@/lib/supabase/server";
import { istWiederherstellung } from "@/lib/passwortWiederherstellung";

export const metadata = { title: "Passwort ändern – Strado" };

export default async function PasswortAendernPage() {
  const user = await getCurrentUser();

  // Kein aktiver Link mehr (abgelaufen/schon verwendet) — zurück zum
  // Anfordern eines neuen statt eines leeren Formulars, das nur mit dem
  // Ablauf-Fehler aus updatePassword() enden würde.
  if (!user) redirect("/anmelden/passwort-vergessen");

  // Dieselbe Prüfung, die updatePassword() serverseitig anstellt — hier nur,
  // um das passende Formular zu zeigen. Sie entscheidet nichts: wer das
  // Feld im Browser entfernt, bekommt trotzdem die Abfrage aus der Aktion.
  const ausWiederherstellung = await istWiederherstellung(user.id);

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <PasswortAendernForm ausWiederherstellung={ausWiederherstellung} />
      </main>
    </div>
  );
}
