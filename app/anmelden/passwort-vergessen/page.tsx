import type { Metadata } from "next";
import Header from "@/components/Header";
import PasswortVergessenForm from "@/components/PasswortVergessenForm";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import { authFehlerText } from "@/lib/authFehler";

export const metadata: Metadata = {
  title: "Passwort vergessen – Strado",
  // Lag als Unterpfad von /anmelden unter dessen altem Disallow mit. Das ist
  // mit app/robots.ts entfallen, also braucht sie die Aussage selbst — und
  // sie ist von /anmelden aus verlinkt (AnmeldenForm.tsx), also erreichbar.
  robots: NICHT_INDEXIEREN,
};

// ?fehler= setzt app/auth/callback/route.ts, wenn sich ein Zurücksetzen-Link
// nicht einlösen liess. Vorher landete dieser Fall auf /anmelden — der einen
// Seite, die nicht weiterhilft, wenn man sein Passwort gerade nicht kennt.
// Jetzt kommt er hier heraus, direkt vor dem Formular für einen neuen Link,
// und liest dazu, warum der alte nicht funktioniert hat.
export default async function PasswortVergessenPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string | string[] }>;
}) {
  const { fehler } = await searchParams;

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/anmelden" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <PasswortVergessenForm hinweis={authFehlerText(fehler)} />
      </main>
    </div>
  );
}
