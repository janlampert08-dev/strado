import { redirect } from "next/navigation";
import Header from "@/components/Header";
import PasswortAendernForm from "@/components/PasswortAendernForm";
import { getCurrentUser } from "@/lib/supabase/server";
import { istWiederherstellung } from "@/lib/passwortWiederherstellung";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

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
      {/* Eigener Scrollbehälter um den zentrierten Rahmen, und min-h-full
          statt flex-1: "justify-center" in einem h-dvh-Flexcontainer
          zentriert auch dann, wenn der Inhalt höher ist als der Platz —
          und überlaufender Inhalt ist an der OBEREN Kante dann nicht mehr
          erreichbar, weil es nichts zu scrollen gibt. Auf 390 × 844 mit
          eingeblendeter Tastatur ist genau das der Fall, und dieser PR hat
          das Risiko vergrössert: der Seitenrahmen bringt 64–80 px
          senkrechte Polsterung mit, die das frühere <main> nicht hatte.
          Mit min-h-full zentriert es weiter, solange es passt, und wächst
          darüber hinaus in den Scrollbereich statt zu beschneiden. */}
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          <PasswortAendernForm ausWiederherstellung={ausWiederherstellung} />
        </Seitenrahmen>
      </div>
    </div>
  );
}
