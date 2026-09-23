import type { Metadata } from "next";
import Header from "@/components/Header";
import AnmeldenForm from "@/components/AnmeldenForm";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import { LEGAL_URLS } from "@/lib/constants";
import { safeInternalPath } from "@/lib/utils/url";
import { authFehlerText } from "@/lib/authFehler";
import { aktiveOAuthAnbieter } from "@/lib/oauth";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

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

  // Google-Knopf nur, wenn der Anbieter per NEXT_PUBLIC_OAUTH_ANBIETER
  // eingeschaltet UND im Supabase-Dashboard konfiguriert ist. Fehlt die
  // Dashboard-Hälfte, meldet die Action lesbar statt ins Leere zu
  // springen (lib/actions/auth.ts) — das Flag hier steuert nur, ob der
  // Knopf überhaupt steht.
  const mitGoogle = aktiveOAuthAnbieter().includes("google");

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
{/* Eigener Scrollbehälter um den zentrierten Rahmen, und min-h-full
          statt flex-1: "justify-center" in einem h-dvh-Flexcontainer
          zentriert auch dann, wenn der Inhalt höher ist als der Platz —
          und überlaufender Inhalt ist an der OBEREN Kante dann nicht mehr
          erreichbar, weil es nichts zu scrollen gibt. Auf 390 × 844 mit
          eingeblendeter Tastatur ist genau das der Fall, und der
          Seitenrahmen bringt 64–80 px senkrechte Polsterung mit, die das
          frühere <main> nicht hatte. Mit min-h-full zentriert es weiter,
          solange es passt, und wächst darüber hinaus in den Scrollbereich
          statt zu beschneiden.

          Die Fehlermeldung darin kommt aus main (?fehler= aus dem
          Auth-Callback, Text aus lib/authFehler.ts). Sie stand dort im
          abgelösten <main>; beim Zusammenführen gehört sie in den
          Seitenrahmen, nicht daneben — sonst stünde sie ausserhalb der
          Spalte, auf die sie sich bezieht, und ohne deren Seitenrand. */}
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          {fehlerText && (
            <p className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
              {fehlerText}
            </p>
          )}
          {mitGoogle && (
            <>
              <GoogleLoginButton nextHref={nextHref} />
              <div aria-hidden="true" className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" />
                <span>oder mit E-Mail</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <AnmeldenForm nextHref={nextHref} />
        </Seitenrahmen>
      </div>
      {/* text-muted statt text-muted/50: bei halber Deckkraft ergaben die
          beiden Links #b0b2b7 auf #fafafa — ein Kontrast von 2.03:1 bei 12px,
          nicht einmal die Hälfte der von WCAG AA geforderten 4.5:1. Das ist
          hier nicht nur eine Lesbarkeitsfrage: Impressum und
          Datenschutzerklärung müssen leicht erkennbar sein, und von dieser
          Seite aus führt der einzige Weg dorthin über genau diese zwei Links.

          Der Hover machte den Text dunkler als den Ruhezustand — die
          Rückmeldung lief also andersherum als überall sonst. Jetzt ist der
          Ruhezustand lesbar und der Hover hebt weiter an. */}
      {/* Der Innenabstand unten rechnet die BottomNav mit ein. Dieser
          <footer> ist ein Geschwister des Scrollbehälters, kein <main> —
          die zentrale Regel in app/globals.css
          (`main { padding-bottom: var(--bottom-nav-h) }`) greift hier also
          nicht, und die fixierte Leiste lag genau über den beiden Links.
          Am Preview auf 390 × 844 nachgesehen: sie waren vollständig
          verdeckt.

          Das ist mehr als ein Schönheitsfehler. Der Kommentar direkt
          darüber begründet die Textfarbe damit, dass von dieser Seite aus
          "der einzige Weg" zu Impressum und Datenschutzerklärung über diese
          zwei Links führt — und dieser Weg war auf dem Telefon keiner.

          --bottom-nav-h ist ab md 0 (siehe globals.css), der Zuschlag
          verschwindet auf dem Desktop also von selbst. */}
      {/* inline-flex + min-h-11 an den beiden Links: als reine Textzeile
          waren sie 15 px hoch. Das sind die zwei Links, über die von dieser
          Seite aus der einzige Weg zu Impressum und Datenschutzerklärung
          führt — sie dürfen nicht das kleinste Ziel der Seite sein. Die
          Zeilenhöhe der Fusszeile bleibt gleich, weil die Fläche über die
          Zeilenbox hinauswächst. */}
      <footer className="pb-[calc(1.5rem+var(--bottom-nav-h))] text-center text-xs text-muted">
        <a
          href={LEGAL_URLS.impressum}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center px-1 transition-colors duration-fast hover:text-foreground"
        >
          Impressum
        </a>{" "}
        &{" "}
        <a
          href={LEGAL_URLS.datenschutz}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center px-1 transition-colors duration-fast hover:text-foreground"
        >
          Datenschutz
        </a>
      </footer>
    </div>
  );
}
