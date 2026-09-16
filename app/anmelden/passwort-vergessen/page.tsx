import type { Metadata } from "next";
import Header from "@/components/Header";
import PasswortVergessenForm from "@/components/PasswortVergessenForm";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

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
      <Seitenrahmen breite="schmal" className="flex-1 justify-center">
        <PasswortVergessenForm />
      </Seitenrahmen>
    </div>
  );
}
