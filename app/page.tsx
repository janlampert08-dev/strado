import type { Metadata } from "next";
import Header from "@/components/Header";
import ExploreView from "@/components/ExploreView";
import { getRoutes } from "@/lib/routes";

// Die wichtigste Seite der App hatte bisher keine eigene Metadata und erbte
// nur "Strado" aus dem Layout — für Suchmaschinen also einen Titel ohne
// jede Aussage darüber, was hier zu finden ist.
export const metadata: Metadata = {
  title: "Strado — kuratierte Fahrstrecken für Auto und Motorrad in der Schweiz",
  description:
    "Entdecke handverlesene Kurven-, Pass- und Aussichtsstrecken rund um Zürich und die Schweiz. Fahrten per GPS aufzeichnen, Bestzeiten vergleichen, Touren mit der Community teilen.",
};

export default async function Home() {
  const { routes, error } = await getRoutes();

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <ExploreView routes={routes} loadError={error} />
    </div>
  );
}
