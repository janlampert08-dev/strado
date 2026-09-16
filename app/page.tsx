import type { Metadata } from "next";
import Header from "@/components/Header";
import ExploreView from "@/components/ExploreView";
import { getRoutes } from "@/lib/routes";
import { getBewertungen } from "@/lib/ratings";
import { getCurrentUser } from "@/lib/supabase/server";
import { BESCHREIBUNG, SLOGAN } from "@/lib/constants";

// Die wichtigste Seite der App hatte bisher keine eigene Metadata und erbte
// nur "Strado" aus dem Layout — für Suchmaschinen also einen Titel ohne
// jede Aussage darüber, was hier zu finden ist.
//
// Der Titel behält die suchbaren Substantive (Strecken, Zürich); der
// informelle Claim steht in der Beschreibung und im OG-Tag (app/layout.tsx),
// wo er gelesen wird, statt im Titel, wo er gesucht werden müsste.
//
// "Zürich" statt "Schweiz": der Bestand ist Zürich-first (AGENTS.md), und
// jede der heute vorhandenen Strecken liegt im Kanton. Ein
// Schweiz-Versprechen auf einer Zürcher Karte liest sich als halbleeres
// Land statt als volle Region — und der Ortsname ist die Einheit, an der
// jemand seine Strasse wiedererkennt.
export const metadata: Metadata = {
  title: "Strado — Die schönsten Strecken rund um Zürich",
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
  const [{ routes, error }, user] = await Promise.all([getRoutes(), getCurrentUser()]);

  // Erst danach, weil die Abfrage die IDs der geladenen Strecken braucht.
  // Eine Abfrage für die ganze Liste, nicht eine pro Zeile — die Begründung
  // steht im Kopf von lib/bewertungen.ts.
  //
  // Als einfaches Objekt statt als Map über die Server/Client-Grenze:
  // ExploreView ist eine Client Component, und ein Objekt ist in der
  // RSC-Nutzlast ohne Rückfrage serialisierbar.
  const bewertungen = Object.fromEntries(await getBewertungen(routes.map((r) => r.id)));

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <ExploreView
        routes={routes}
        bewertungen={bewertungen}
        loadError={error}
        loggedIn={!!user}
      />
    </div>
  );
}
