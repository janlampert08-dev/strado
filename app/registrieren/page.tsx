import type { Metadata } from "next";
import Header from "@/components/Header";
import RegistrierenForm from "@/components/RegistrierenForm";
import { safeInternalPath } from "@/lib/utils/url";
import { NICHT_INDEXIEREN } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Registrieren – Strado",
  // Entfällt seit dieser Änderung aus der Disallow-Liste in app/robots.ts
  // und wird stattdessen hier aus dem Index gehalten. Der Grund steht dort
  // ausführlich: das Formular ist von jeder öffentlichen Streckenseite aus
  // verlinkt (RatingSection.tsx), ein Disallow hätte die Adresse also
  // weiterhin als inhaltslose URL im Index gelassen — je ?next=-Wert eine
  // eigene.
  robots: NICHT_INDEXIEREN,
};

// ?next wie auf /anmelden: wohin es nach der Registrierung weitergeht,
// gesetzt z.B. vom Anmelde-Gate im Fazit einer Gastfahrt (FreeRideForm.tsx),
// damit die aufgezeichnete Fahrt nach dem Konto-Erstellen nicht irgendwo
// anders landet. Die Prüfung hier ersetzt nicht die in signUp() — das
// Formular ist ein öffentlich aufrufbarer Endpunkt, dessen FormData
// unabhängig von diesem Markup gesetzt werden kann.
export default async function RegistrierenPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextHref = safeInternalPath(next) ?? undefined;

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <RegistrierenForm nextHref={nextHref} />
      </main>
    </div>
  );
}
