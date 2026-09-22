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
    scope: "/",
    display: "standalone",
    // Dunkel als Splash/Task-Farbe: Dark ist der Fahrmodus, und ein weisser
    // Blitz beim Start aus dem Homescreen fällt nachts stärker auf als ein
    // dunkler bei Tag. Manifest kennt keine Media Queries — ein Wert gewinnt.
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    // Homescreen-Shortcut: "Fahrt starten" ist der Handschuh-Flow — ein Tap
    // vom Homescreen statt Nav-Mitte suchen.
    shortcuts: [
      {
        name: "Fahrt starten",
        url: "/fahrten/neu",
      },
      {
        name: "Pässe",
        url: "/paesse",
      },
    ],
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
