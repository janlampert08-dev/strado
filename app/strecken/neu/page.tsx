import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import Header from "@/components/Header";
import NeueStreckeForm from "@/components/NeueStreckeForm";

export default async function NeueStreckePage() {
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");

  // Bis 0086 stand hier eine Premium-Weiche: wer kein Abo hatte, sah statt
  // des Formulars eine Werbekarte (components/PremiumGate.tsx, mit dieser
  // Änderung entfernt). Das Anlegen ist wieder für jedes angemeldete Konto
  // offen — additives Gating, siehe docs/premium-plan.md Abschnitt 4 und
  // supabase/migrations/0086_strecken_anlegen_wieder_offen.sql.
  //
  // Ein Abo ändert für Strecken nur noch eines: wie viele davon PRIVAT sein
  // dürfen (kostenlos eine, Premium unbegrenzt). Das wird nicht hier
  // entschieden, sondern in proposeRoute nach dem Anlegen — dort liegen die
  // Daten, und dort kann die Strecke bei erschöpftem Kontingent als
  // öffentlicher Vorschlag weiterlaufen, statt verloren zu gehen.

  // Die Kopfleiste rendert die Seite selbst (wie jede andere Seite, siehe
  // app/strecken/[id]/page.tsx): der Zurück-Knopf gehört oben links hin und
  // sass hier zuvor als einziger in der ganzen App im Seiteninhalt — im
  // Formular-Sheet über der Überschrift, auf Mobile also irgendwo in der
  // unteren Bildschirmhälfte. NeueStreckeForm ist eine Client-Komponente und
  // kann <Header /> (async, server) nicht selbst einbinden.
  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <NeueStreckeForm />
    </div>
  );
}
