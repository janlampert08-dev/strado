import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PasswortAendernForm from "@/components/PasswortAendernForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Passwort ändern – Strado" };

export default async function PasswortAendernPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Kein aktiver Link mehr (abgelaufen/schon verwendet) — zurück zum
  // Anfordern eines neuen statt eines leeren Formulars, das nur mit dem
  // Ablauf-Fehler aus updatePassword() enden würde.
  if (!user) redirect("/anmelden/passwort-vergessen");

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <PasswortAendernForm />
      </main>
    </div>
  );
}
