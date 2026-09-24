import { Metadata } from "next";
import Header from "@/components/Header";
import RegistrierenForm from "@/components/RegistrierenForm";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import WartendeFahrt from "@/components/WartendeFahrt";
import { safeInternalPath } from "@/lib/utils/url";
import { aktiveOAuthAnbieter } from "@/lib/oauth";
import { EINRICHTUNG_PFAD } from "@/lib/einrichtung";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

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
//
// ?promo= wird von RegistrierenForm als verstecktes Feld an signUp()
// weitergereicht und dort in raw_user_meta_data.promo_code gelegt.
// Der Trigger handle_new_user() (0121) prüft den Code gegen
// premium_promo_codes und vergibt 7 Tage Premium.
export default async function RegistrierenPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; promo?: string }>;
}) {
  const { next, promo } = await searchParams;
  const nextHref = safeInternalPath(next) ?? undefined;
  const promoCode = promo ? promo.toLowerCase() : null;
  // Google-Knopf wie auf /anmelden (lib/oauth.ts) — ein Tap statt Formular
  // plus Code. Hinweis: Creator-Herkunft und Promo-Code reisen nur über das
  // E-Mail-Formular mit (lib/actions/auth.ts); wer über Google kommt, bekommt
  // vorerst weder Attribution noch Gratis-Tage.
  const mitGoogle = aktiveOAuthAnbieter().includes("google");

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      {/* Eigener Scrollbehälter um den zentrierten Rahmen, und min-h-full
          statt flex-1: "justify-center" in einem h-dvh-Flexcontainer
          zentriert auch dann, wenn der Inhalt höher ist als der Platz —
          und überlaufender Inhalt ist an der OBEREN Kante dann nicht mehr
          erreichbar, weil es nichts zu scrollen gibt. Auf 390 × 844 mit
          eingeblendeter Tastatur ist genau das der Fall, und dieser PR hat
          das Risiko vergrössert: der Seitenrahmen bringt 64–80 px
          senkrechte Polsterung mit, die das frühere <main> nicht hatte.
          Mit min-h-full zentriert es weiter, solange es passt, und wächst
          darüber hinaus in den Scrollbereich statt zu beschneiden. */}
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          {/* Nur wer aus dem Fazit einer Gastfahrt kommt: seine Fahrt über
              dem Formular statt eines Formulars ohne Grund. */}
          <WartendeFahrt ziel={nextHref} />
          {mitGoogle && (
            <>
              {/* Ohne eigenes Ziel wie die E-Mail-Registrierung auf die
                  Einrichtung (lib/actions/auth.ts). Wer sie schon erledigt
                  hat — ein bestehendes Google-Konto —, schickt die Seite
                  selbst weiter. */}
              <GoogleLoginButton nextHref={nextHref ?? EINRICHTUNG_PFAD} />
              <div aria-hidden="true" className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" />
                <span>oder mit E-Mail</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <RegistrierenForm nextHref={nextHref} promoCode={promoCode} />
        </Seitenrahmen>
      </div>
    </div>
  );
}
