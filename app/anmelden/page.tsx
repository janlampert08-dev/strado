import type { Metadata } from "next";
import Header from "@/components/Header";
import AnmeldenForm from "@/components/AnmeldenForm";
import { LEGAL_URLS } from "@/lib/constants";
import { safeInternalPath } from "@/lib/utils/url";
import { authFehlerText } from "@/lib/authFehler";
import { NICHT_INDEXIEREN } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Anmelden – Strado",
  // Entfällt seit dieser Änderung aus der Disallow-Liste in app/robots.ts
  // und wird stattdessen hier aus dem Index gehalten. Der Grund steht dort
  // ausführlich: das Formular ist von jeder öffentlichen Streckenseite aus
  // verlinkt (RatingSection.tsx), ein Disallow hätte die Adresse also
  // weiterhin als inhaltslose URL im Index gelassen — je ?next=-Wert eine
  // eigene.
  robots: NICHT_INDEXIEREN,
};

// ?next steuert, wohin es nach erfolgreicher Anmeldung geht, statt immer fest
// zu /profil — gesetzt z.B. vom Auth-Gate in app/fahrten/neu/page.tsx, damit
// "Fahrt starten" auch abgemeldet dort ankommt, wo es hinführen soll. Fehlt
// der Parameter oder zeigt er nicht auf einen internen Pfad, bleibt /profil
// der Standard (siehe safeInternalPath).
//
// Diese Prüfung ersetzt nicht die in signIn(): das Formular ist ein
// öffentlich aufrufbarer Endpunkt, dessen FormData unabhängig von dem
// gesetzt werden kann, was hier gerendert wurde. Serverseitig entscheidet
// deshalb allein signIn(); hier wird nur nicht erst ein unbrauchbarer Wert
// ins Markup geschrieben.
//
// Der Zurück-Pfeil zeigt bewusst weiter auf "/": zurück auf das ?next-Ziel
// würde bei einer geschützten Seite nur wieder hierher umleiten.
export default async function AnmeldenPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; fehler?: string | string[] }>;
}) {
  const { next, fehler } = await searchParams;
  const nextHref = safeInternalPath(next) ?? undefined;

  // ?fehler= setzt app/auth/callback/route.ts, wenn sich ein Bestätigungs-
  // oder Anmeldelink nicht einlösen liess. Der Parameter wurde seit jeher
  // gesetzt und von niemandem gelesen — wer auf einem toten Link landete,
  // sah genau dieses Formular ohne ein Wort dazu. Der Text kommt aus einer
  // festen Zuordnung (lib/authFehler.ts), nie aus der Adresszeile.
  const fehlerText = authFehlerText(fehler);

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        {fehlerText && (
          <p
            role="alert"
            className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger"
          >
            {fehlerText}
          </p>
        )}
        <AnmeldenForm nextHref={nextHref} />
      </main>
      {/* text-muted statt text-muted/50: bei halber Deckkraft ergaben die
          beiden Links #b0b2b7 auf #fafafa — ein Kontrast von 2.03:1 bei 12px,
          nicht einmal die Hälfte der von WCAG AA geforderten 4.5:1. Das ist
          hier nicht nur eine Lesbarkeitsfrage: Impressum und
          Datenschutzerklärung müssen leicht erkennbar sein, und von dieser
          Seite aus führt der einzige Weg dorthin über genau diese zwei Links.

          Der Hover machte den Text dunkler als den Ruhezustand — die
          Rückmeldung lief also andersherum als überall sonst. Jetzt ist der
          Ruhezustand lesbar und der Hover hebt weiter an. */}
      <footer className="pb-6 text-center text-xs text-muted">
        <a
          href={LEGAL_URLS.impressum}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors duration-fast hover:text-foreground"
        >
          Impressum
        </a>{" "}
        &{" "}
        <a
          href={LEGAL_URLS.datenschutz}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors duration-fast hover:text-foreground"
        >
          Datenschutz
        </a>
      </footer>
    </div>
  );
}
