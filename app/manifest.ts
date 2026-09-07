import type { MetadataRoute } from "next";
import { BESCHREIBUNG } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // name erscheint im Installations-Dialog, short_name auf dem
    // Home-Bildschirm. Die Beschreibung teilt sich die Quelle mit der
    // meta-description (lib/constants.ts) — bewusst, damit Installations-
    // Dialog und Suchtreffer nicht auseinanderlaufen.
    name: "Strado — Fahrstrecken für Auto & Motorrad",
    short_name: "Strado",
    description: BESCHREIBUNG,
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
