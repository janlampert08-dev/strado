import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import BestaetigenForm from "@/components/BestaetigenForm";
import AnderesGeraetForm from "@/components/AnderesGeraetForm";
import {
  BESTAETIGUNG_GUELTIG_SEKUNDEN,
  CODE_LAENGE,
  emailAndeuten,
  leseBestaetigung,
} from "@/lib/bestaetigung";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

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
      {/* Dieselbe Geometrie wie /anmelden und /registrieren seit #270:
          Seitenrahmen für den einen Seitenabstand der App, darum ein eigener
          Scrollbehälter mit min-h-full statt flex-1. "justify-center" in
          einem h-dvh-Flexcontainer zentriert auch dann noch, wenn der Inhalt
          höher ist als der Platz — und dann ist die OBERE Kante nicht mehr
          erreichbar, weil es nichts zu scrollen gibt.

          Diese Seite braucht das so dringend wie die beiden anderen: sie
          trägt ein Eingabefeld, das auf dem Telefon die Tastatur öffnet und
          damit rund die Hälfte der Höhe wegnimmt. Sie stand bis hierher noch
          auf dem abgelösten handgeschriebenen <main> mit px-6 — die
          Umstellung in #270 kam an ihr vorbei, weil sie zur selben Zeit auf
          einem anderen Zweig entstand. */}
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          {offen ? (
            <BestaetigenForm
              emailHinweis={emailAndeuten(offen.email)}
              codeLaenge={CODE_LAENGE}
              gueltigMinuten={BESTAETIGUNG_GUELTIG_SEKUNDEN / 60}
            />
          ) : (
            // Kein Cookie: abgelaufen (60 Minuten), in einem anderen Browser
            // registriert, oder jemand ruft die Adresse einfach so auf. Das
            // Formular oben holt den Code aufs hiesige Gerät (Adresse aus
            // der Registrierung genügt, Antwort immer gleich) — erst wenn
            // auch das nicht zieht, führt der Weg über Anmeldung oder
            // Neuregistrierung.
            <>
              <AnderesGeraetForm />
              <div className="flex flex-col gap-2 border-t border-border pt-5 text-sm">
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
        </Seitenrahmen>
      </div>
    </div>
  );
}
