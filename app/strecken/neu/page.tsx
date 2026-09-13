import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/premium";
import { isModerator } from "@/lib/moderation";
import Header from "@/components/Header";
import NeueStreckeForm from "@/components/NeueStreckeForm";
import PremiumGate from "@/components/PremiumGate";

export default async function NeueStreckePage() {
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");

  // Ohne Abo (und ohne Moderationsrolle) statt des Formulars die kleine
  // Premium-Werbung. Das ist UX: die Schranke selbst liegt in der
  // INSERT-Policy auf routes (0077) und in proposeRoute — ein Formular, das
  // erst beim Speichern scheitert, wäre nur der unfreundlichere Weg zur
  // selben Antwort. Beide Abfragen hängen nur an user, nicht voneinander.
  const [status, moderator] = await Promise.all([getPremiumStatus(), isModerator(user.id)]);
  if (!status.aktiv && !moderator) return <PremiumGate />;

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
