import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import BestaetigenForm from "@/components/BestaetigenForm";
import {
  CODE_LAENGE,
  emailAndeuten,
  leseBestaetigung,
} from "@/lib/bestaetigung";
import { NICHT_INDEXIEREN } from "@/lib/seo";

// Hatte bisher keine Metadata und erbte damit den Titel "Strado" aus dem
// Layout — dieselbe Zeile wie die Startseite, für eine Zwischenseite, die
// nur "schau in dein Postfach" sagt. Sie steht jedem offen (keine
// Session-Prüfung) und war deshalb indexierbar.
export const metadata: Metadata = {
  title: "E-Mail bestätigen – Strado",
  robots: NICHT_INDEXIEREN,
};

// Bis zur Umstellung auf den Code war das eine reine Textseite: "wir haben
// dir eine E-Mail geschickt, klick auf den Link". Jetzt wird hier gearbeitet
// — der Code aus der E-Mail wird eingegeben und eingelöst. Warum Code statt
// Link: supabase/email-vorlagen/README.md.
//
// Welche Adresse gemeint ist, steht im Cookie, nicht in der Adresszeile
// (lib/bestaetigung.ts). Es zu lesen macht die Seite dynamisch — das ist
// hier richtig so, eine vorgerenderte Fassung wäre für jeden dieselbe.
export default async function BestaetigenPage() {
  const offen = await leseBestaetigung();

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-6">
        {offen ? (
          <BestaetigenForm
            emailHinweis={emailAndeuten(offen.email)}
            codeLaenge={CODE_LAENGE}
          />
        ) : (
          // Kein Cookie: abgelaufen (60 Minuten), in einem anderen Browser
          // registriert, oder jemand ruft die Adresse einfach so auf. Ohne
          // die Adresse lässt sich der Code nicht einlösen, und sie hier
          // abzufragen wäre genau das Formular, das lib/bestaetigung.ts
          // vermeidet. Der Weg zurück führt deshalb über die Anmeldung: wer
          // sein Passwort kennt, landet von dort automatisch wieder hier.
          <>
            <h1 className="text-display font-semibold">E-Mail bestätigen</h1>
            <p className="text-sm text-muted">
              Wir wissen gerade nicht, für welche Adresse der Code gilt — das
              passiert, wenn der Link zu lange offen lag oder du dich in einem
              anderen Browser registriert hast.
            </p>
            <p className="text-sm text-muted">
              Melde dich mit deiner E-Mail-Adresse und deinem Passwort an, dann
              kommst du direkt hierher zurück und kannst einen neuen Code
              anfordern.
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link
                href="/anmelden"
                className="font-medium text-accent hover:underline"
              >
                Zur Anmeldung
              </Link>
              <Link
                href="/registrieren"
                className="font-medium text-accent hover:underline"
              >
                Neues Konto anlegen
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
