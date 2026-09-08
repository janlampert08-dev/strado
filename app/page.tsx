import type { Metadata } from "next";
import Header from "@/components/Header";
import ExploreView from "@/components/ExploreView";
import { getRoutes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/server";
import { BESCHREIBUNG, SLOGAN } from "@/lib/constants";

// Die wichtigste Seite der App hatte bisher keine eigene Metadata und erbte
// nur "Strado" aus dem Layout — für Suchmaschinen also einen Titel ohne
// jede Aussage darüber, was hier zu finden ist.
//
// Der Titel behält die suchbaren Substantive (Strecken, Schweiz); der
// informelle Claim steht in der Beschreibung und im OG-Tag (app/layout.tsx),
// wo er gelesen wird, statt im Titel, wo er gesucht werden müsste.
export const metadata: Metadata = {
  title: "Strado — Die schönsten Strecken der Schweiz",
  description: `${SLOGAN} ${BESCHREIBUNG}`,
};

export default async function Home() {
  // getCurrentUser() ist per React cache() request-weit dedupliziert, und
  // <Header /> ruft es auf derselben Anfrage ohnehin auf — der Aufruf hier
  // kostet also keinen zusätzlichen GoTrue-Roundtrip. Parallel zu
  // getRoutes(), weil beide voneinander unabhängig sind.
  const [{ routes, error }, user] = await Promise.all([getRoutes(), getCurrentUser()]);

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <ExploreView routes={routes} loadError={error} loggedIn={!!user} />
    </div>
  );
}
