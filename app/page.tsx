import type { Metadata } from "next";
import Header from "@/components/Header";
import ExploreView from "@/components/ExploreView";
import { getFreigegebeneStreckenIds, getRoutes } from "@/lib/routes";
import { getBewertungen } from "@/lib/ratings";
import { getPassZustaendeJeStrecke } from "@/lib/paesse";
import { getCurrentUser } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
import { BESCHREIBUNG, SLOGAN } from "@/lib/constants";

// Die wichtigste Seite der App hatte bisher keine eigene Metadata und erbte
// nur "Strado" aus dem Layout — für Suchmaschinen also einen Titel ohne
// jede Aussage darüber, was hier zu finden ist.
//
// Der Titel behält die suchbaren Substantive (Strecken, Schweiz); der
// informelle Claim steht in der Beschreibung und im OG-Tag (app/layout.tsx),
// wo er gelesen wird, statt im Titel, wo er gesucht werden müsste.
//
// "Schweiz" statt des früheren "rund um Zürich": Strado ist schweizweit
// ausgerichtet, und das Land ist der Begriff, den jemand eingibt, der nach
// Pässen und Kurvenstrassen sucht, ohne schon eine Region im Kopf zu haben.
//
// Die Wiedererkennung am einzelnen Ort — "das ist die Strasse über meinem
// Dorf", der Grund, aus dem jemand eine Strecke weiterleitet — hängt damit
// ganz am Streckennamen und an der Region auf der Karte, nicht mehr am
// Seitentitel. Wer Strecken aufnimmt, trägt diese Last jetzt allein: eine
// Strecke ohne erkennbaren Ortsnamen ist schweizweit unauffindbar, wo sie
// auf einer Zürcher Karte noch durch die Nachbarschaft getragen wurde.
export const metadata: Metadata = {
  title: "Strado — Die schönsten Strecken der Schweiz",
  description: `${SLOGAN} ${BESCHREIBUNG}`,
  // Kanonische Adresse. Die App wird unter mehr als einem Hostnamen
  // ausgeliefert — app.strado.ch, die Vorschau-Adressen jedes Deployments,
  // dazu Staging — und lieferte bis hierher auf keiner davon ein Canonical
  // aus (im ausgelieferten HTML nachgesehen). Damit steht derselbe Inhalt
  // mehrfach zur Auswahl, und welche Adresse eine Suchmaschine nimmt, ist
  // ihre Entscheidung statt unsere.
  //
  // Der relative Pfad wird von Next gegen metadataBase aufgelöst
  // (app/layout.tsx). Bewusst ohne Query: alternates.canonical gehört an die
  // Adresse OHNE ?-Parameter, sonst zählt jeder Filter- und Marker-Wert als
  // eigene Seite.
  alternates: { canonical: "/" },
};

export default async function Home() {
  // getCurrentUser() ist per React cache() request-weit dedupliziert, und
  // <Header /> ruft es auf derselben Anfrage ohnehin auf — der Aufruf hier
  // kostet also keinen zusätzlichen GoTrue-Roundtrip. Parallel zu
  // getRoutes(), weil beide voneinander unabhängig sind.
  //
  // Bewertungen und Passzustand laufen in derselben Welle mit. Sie brauchen
  // nur die IDs der freigegebenen Strecken, und die liefert eine eigene,
  // schmale Abfrage (getFreigegebeneStreckenIds) schneller als getRoutes()
  // mit seinen Geometrien. Bis 2026-09-25 warteten beide auf getRoutes() und
  // hängten damit eine zweite (beim Passzustand: dritte und vierte)
  // Datenbank-Runde hinten an. Dieselbe Menge ist es, weil beide Abfragen
  // auf status_ok filtern; weicht sie in einem Moment ab (eine Strecke wird
  // genau dazwischen freigegeben), fehlt einer Zeile höchstens der Stern.
  //
  // Eine Abfrage für die ganze Liste, nicht eine pro Zeile — die Begründung
  // steht im Kopf von lib/bewertungen.ts.
  //
  // Als einfaches Objekt statt als Map über die Server/Client-Grenze:
  // ExploreView ist eine Client Component, und ein Objekt ist in der
  // RSC-Nutzlast ohne Rückfrage serialisierbar.
  //
  // Passzustand nur, wenn er die Planung ändert (gesperrt, eingeschränkt,
  // Wintersperre — zeigeInListe in lib/passStatus.ts). Am 2026-09-21 war er
  // ganz von der Startseite genommen worden; am 2026-09-23 entschied der
  // Eigentümer, Sperrungen dort wieder zu zeigen: "Ist der Pass offen?" ist
  // die erste Frage, und sie soll ohne Öffnen der Strecke beantwortet sein.
  // "Offen" bleibt ohne Abzeichen, sonst trüge fast jede Zeile eins.
  // Beide Abfragen hängen am selben Streckenbestand, aber nicht aneinander.
  const [{ routes, signaturen, error }, user, origin, [bewertungenPaare, passZustaende]] =
    await Promise.all([
      getRoutes(),
      getCurrentUser(),
      getOrigin(),
      getFreigegebeneStreckenIds().then((ids) =>
        Promise.all([getBewertungen(ids), getPassZustaendeJeStrecke(ids)]),
      ),
    ]);
  const bewertungen = Object.fromEntries(bewertungenPaare);

  // Strukturierte Daten der Startseite — bisher die einzige Hauptseite ohne.
  // WebSite verweist per @id auf die Anbieterin, die die Info-Seite
  // (www.strado.ch, stradoinfo/index.html) beschreibt, statt sie hier ein
  // zweites Mal mit eigenen Angaben zu behaupten. Die ItemList nennt die
  // Strecken, die auch sichtbar in der Liste stehen: getRoutes() liefert nur
  // freigegebene (status_ok), und private Strecken sind nie freigegeben —
  // geprüft am 2026-09-24, 2 private, beide status_ok = false.
  const strukturierteDaten = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: `${origin}/`,
        name: "Strado",
        inLanguage: "de-CH",
        publisher: { "@id": "https://www.strado.ch/#anbieterin" },
      },
      {
        "@type": "ItemList",
        name: "Strecken auf Strado",
        numberOfItems: routes.length,
        itemListElement: routes.map((route, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${origin}/strecken/${route.id}`,
          name: route.name,
        })),
      },
    ],
  };

  return (
    <div className="flex h-dvh flex-col">
      {/* Streckennamen sind Moderationsinput — escaped wie auf der
          Streckenseite, ein "</script>" im Namen beendete sonst den Block. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(strukturierteDaten)
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026"),
        }}
      />
      <Header />
      <ExploreView
        routes={routes}
        signaturen={signaturen}
        bewertungen={bewertungen}
        passZustaende={Object.fromEntries(passZustaende)}
        loadError={error}
        loggedIn={!!user}
      />
    </div>
  );
}
