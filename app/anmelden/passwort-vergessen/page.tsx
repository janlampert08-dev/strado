import type { Metadata } from "next";
import Header from "@/components/Header";
import PasswortVergessenForm from "@/components/PasswortVergessenForm";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
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
{/* Eigener Scrollbehälter um den zentrierten Rahmen, und min-h-full
          statt flex-1: "justify-center" in einem h-dvh-Flexcontainer
          zentriert auch dann, wenn der Inhalt höher ist als der Platz —
          und überlaufender Inhalt ist an der OBEREN Kante dann nicht mehr
          erreichbar, weil es nichts zu scrollen gibt. Auf 390 × 844 mit
          eingeblendeter Tastatur ist genau das der Fall, und der
          Seitenrahmen bringt 64–80 px senkrechte Polsterung mit, die das
          frühere <main> nicht hatte. Mit min-h-full zentriert es weiter,
          solange es passt, und wächst darüber hinaus in den Scrollbereich
          statt zu beschneiden. */}
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          {/* hinweis kommt aus main: ?fehler= aus dem Auth-Callback, Text
              aus lib/authFehler.ts. Das Formular rendert ihn selbst, der
              Rahmen ändert daran nichts. */}
          <PasswortVergessenForm hinweis={authFehlerText(fehler)} />
        </Seitenrahmen>
      </div>
    </div>
  );
}
