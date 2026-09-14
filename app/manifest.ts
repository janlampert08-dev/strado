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
    // Zwei Einträge, weil Android zwei verschiedene Dinge mit einem Icon
    // macht. "any" wird gezeigt wie geliefert (Chrome-Reiter, Verknüpfung
    // im Browser); "maskable" wird auf die Systemform beschnitten — Kreis,
    // Squircle, Tropfen — und braucht dafür Luft am Rand.
    //
    // Ohne den maskable-Eintrag schrumpft Android das normale Icon in einen
    // Kreis und legt Weiss darunter: die Kachel erscheint klein mit
    // sichtbaren Ecken. Mit dem alten, fast quadratisch gefüllten "s" fiel
    // das kaum auf; beim flachen Rundkurs blieb wenig übrig.
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
