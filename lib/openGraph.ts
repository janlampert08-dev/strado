import { SLOGAN } from "@/lib/constants";

// Next führt Metadaten aus Layout und Seite nur FLACH zusammen: sobald eine
// Seite einen eigenen openGraph-Block setzt, ersetzt er den des Layouts
// vollständig — samt der Felder, die sie gar nicht anfassen wollte. Die
// Next-Doku sagt das ausdrücklich ("All openGraph fields from app/layout.js
// are replaced … Note the absence of openGraph.description",
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md).
//
// Was dabei bisher unbemerkt wegfiel: das Vorschaubild. /fahrten/<id> und
// /fahrer/<id> setzen einen eigenen Block und kamen deshalb ganz ohne
// og:image aus der Auslieferung — ausgerechnet die beiden Seiten, deren
// Links geteilt werden, und bei gesetztem twitter:card="summary_large_image",
// das ein grosses Bild verspricht. og:site_name und og:locale fielen mit weg.
//
// Die Sammlung hier ist das, was eine Seite beim Setzen eigener Felder
// mitnehmen muss. Die description gehört NICHT hinein: die ist je Seite
// verschieden und steht bewusst an jeder Aufrufstelle.
// Bewusst ohne "as const": das machte images zu einem readonly-Tupel, und
// Next's OpenGraph-Typ nimmt nur ein veränderbares Array. Der Build hat das
// gemeldet, nicht der Editor — Metadatenfelder sind erst beim Typecheck eng.
export const OG_GEERBT = {
  locale: "de_CH",
  siteName: "Strado",
  images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `Strado — ${SLOGAN}` }],
};

/**
 * Dasselbe mit einem seitenspezifischen Bild statt des Markenbildes — für
 * Segmente mit eigener opengraph-image.tsx. Ohne diesen ausdrücklichen
 * Eintrag nähme ein neuer openGraph-Block auch das segmenteigene Bild mit
 * weg, nach derselben Ersetzungsregel.
 */
export function ogMitBild(pfad: string, alt: string) {
  return {
    ...OG_GEERBT,
    images: [{ url: pfad, width: 1200, height: 630, alt }],
  };
}
