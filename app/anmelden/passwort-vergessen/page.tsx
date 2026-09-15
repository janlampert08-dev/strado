import type { Metadata } from "next";
import Header from "@/components/Header";
import PasswortVergessenForm from "@/components/PasswortVergessenForm";
import { NICHT_INDEXIEREN } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Passwort vergessen – Strado",
  // Lag als Unterpfad von /anmelden unter dessen altem Disallow mit. Das ist
  // mit app/robots.ts entfallen, also braucht sie die Aussage selbst — und
  // sie ist von /anmelden aus verlinkt (AnmeldenForm.tsx), also erreichbar.
  robots: NICHT_INDEXIEREN,
};

export default function PasswortVergessenPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header back="/anmelden" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <PasswortVergessenForm />
      </main>
    </div>
  );
}
