import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // name erscheint im Installations-Dialog, short_name auf dem
    // Home-Bildschirm. Die Beschreibung war wortgleich mit der
    // meta-description und nannte weder Region noch das, was die App
    // eigentlich kann.
    name: "Cornice — Fahrstrecken für Auto & Motorrad",
    short_name: "Cornice",
    description:
      "Kuratierte Kurven- und Passstrecken in der Schweiz. Fahrten per GPS aufzeichnen, Bestzeiten vergleichen, Touren teilen.",
    lang: "de-CH",
    dir: "ltr",
    categories: ["travel", "navigation", "sports"],
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
