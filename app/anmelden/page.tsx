import Header from "@/components/Header";
import AnmeldenForm from "@/components/AnmeldenForm";
import { LEGAL_URLS } from "@/lib/constants";
import { safeInternalPath } from "@/lib/utils/url";

export const metadata = { title: "Anmelden – Strado" };

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
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextHref = safeInternalPath(next) ?? undefined;

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <AnmeldenForm nextHref={nextHref} />
      </main>
      <p className="pb-6 text-center text-xs text-muted/50">
        <a
          href={LEGAL_URLS.impressum}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors duration-fast hover:text-muted"
        >
          Impressum
        </a>{" "}
        &{" "}
        <a
          href={LEGAL_URLS.datenschutz}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors duration-fast hover:text-muted"
        >
          Datenschutz
        </a>
      </p>
    </div>
  );
}
