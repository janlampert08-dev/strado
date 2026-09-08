import { redirect } from "next/navigation";
import Header from "@/components/Header";
import AboBestaetigung from "@/components/AboBestaetigung";
import PremiumWillkommen from "@/components/PremiumWillkommen";
import { getCurrentUser } from "@/lib/supabase/server";
import { getPremiumStatus } from "@/lib/premium";

// Der Rückweg nach der Zahlung — und die einzige Seite, die den Abschluss
// quittiert.
//
// Zwei Wege führen hierher:
//
//   1. Zahlungsarten mit Weiterleitung. Kartenzahlungen werden im Payment
//      Element ohne Seitenwechsel bestätigt (redirect: "if_required"), TWINT
//      und einige Bankverfahren führen dagegen zur Bank oder in die
//      Banking-App und danach an die return_url zurück — hierher. Für ein
//      Schweizer Produkt ist das der wichtigste Weg.
//   2. Nach einer Kartenzahlung schickt components/PremiumCheckoutForm.tsx
//      selbst hierher. Vorher landete man dort wortlos auf /profil.
//
// Was diese Seite NICHT mehr tut: bestätigen. Die Bestätigung schreibt
// (Abo-Zustand, danach revalidatePath) — eine Mutation, und die verbietet
// Next.js im Render. Genau daran ist die Seite am 2026-09-08 gescheitert:
// die Zahlung ging durch, der Zustand wurde geschrieben, und danach brach
// das Rendern mit "revalidatePath during render which is unsupported" ab.
// Wer bezahlt hatte, sah eine Fehlerseite. Die Bestätigung liegt jetzt in
// components/AboBestaetigung.tsx und läuft dort über eine Server Action.
//
// Hier bleibt nur ein Lesevorgang: steht Premium bereits (weil der Webhook
// schneller war oder die Karte im Formular schon bestätigt wurde), gibt es
// nichts nachzuprüfen — dann steht der Gruss sofort, ganz ohne Stripe-Aufruf.
export const dynamic = "force-dynamic";

export const metadata = { title: "Willkommen bei Premium – Strado" };

export default async function PremiumAbschlussPage({
  searchParams,
}: {
  searchParams: Promise<{ sitzung?: string; abo?: string }>;
}) {
  // Parallel statt nacheinander: die drei hängen nicht voneinander ab
  // (getPremiumStatus holt den Nutzer über denselben cache()-Aufruf), und
  // hintereinander waren es drei Wartezeiten auf einer Seite, die nach der
  // Zahlung so schnell wie möglich stehen soll.
  const [{ sitzung, abo }, user, status] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getPremiumStatus(),
  ]);

  if (!user) redirect("/anmelden");

  // Ohne Sitzungs- oder Abo-Kennung ist hier niemand nach einer Zahlung
  // gelandet, sondern über ein Lesezeichen oder den Verlauf. Die Quittung
  // hängt deshalb am Kaufvorgang und nicht am Zustand: wer seit Monaten
  // Premium hat und diese Adresse aufruft, bekommt sonst Abzeichen,
  // "Willkommen bei Premium" und "du trägst Strado jetzt mit" — und genau
  // das nutzt den Moment ab, für den die Seite gebaut ist.
  if (!sitzung && !abo) redirect("/profil");

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      {/* Kein justify-center: der Inhalt ist auf einem Telefonbildschirm
          höher als die Ansicht, und ein zentrierter Flex-Inhalt in einem
          scrollenden Container lässt sich am oberen Rand nicht mehr
          erreichen — dieselbe Falle wie auf der Kaufseite. */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 overflow-y-auto px-5 py-8 sm:px-6">
        {status.aktiv ? (
          <PremiumWillkommen status={status} />
        ) : (
          <AboBestaetigung sitzung={sitzung ?? null} abo={abo ?? null} />
        )}
      </main>
    </div>
  );
}
