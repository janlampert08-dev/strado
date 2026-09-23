import type { MetadataRoute } from "next";
import { BESCHREIBUNG } from "@/lib/constants";
import { KURZBEFEHLE } from "@/lib/kurzbefehle";

// Der dunkle Hintergrund aus app/globals.css (--color-background unter
// prefers-color-scheme: dark bzw. data-theme="dark"). Das Manifest kennt
// keine Media-Abfragen, also gilt hier eine Farbe für alle — und zwar die
// dunkle: Bis 2026-09 stand hier #fafafa, und ein Telefon im Dunkelmodus
// zeigte beim Start der installierten App erst ein weisses Blatt, bevor die
// dunkle Seite kam. Ein dunkler Startbildschirm vor einer hellen Seite fällt
// weit weniger auf als umgekehrt. Sobald die Seite geladen ist, übernimmt
// ohnehin das theme-color-Meta aus app/layout.tsx, das dem Systemschema
// folgt; iOS nimmt statt background_color die Startbilder
// (lib/startbilder.ts).
const DUNKLER_HINTERGRUND = "#0b0b0d";

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
    // id ausdrücklich gleich dem, was Browser bisher aus start_url
    // abgeleitet haben ("/"). Ein anderer Wert machte aus jeder bereits
    // installierten App für den Browser eine fremde; so bleibt sie dieselbe,
    // auch wenn start_url sich einmal ändert.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: DUNKLER_HINTERGRUND,
    theme_color: DUNKLER_HINTERGRUND,
    // Drei Einträge, weil Android zwei verschiedene Dinge mit einem Icon
    // macht. "any" wird gezeigt wie geliefert (Chrome-Reiter, Verknüpfung
    // im Browser) — in 192 und 512, den beiden Grössen, die Chrome für die
    // Installation verlangt (app/icon.tsx); "maskable" wird auf die
    // Systemform beschnitten — Kreis, Squircle, Tropfen — und braucht dafür
    // Luft am Rand.
    //
    // Ohne den maskable-Eintrag schrumpft Android das normale Icon in einen
    // Kreis und legt Weiss darunter: die Kachel erscheint klein mit
    // sichtbaren Ecken. Mit dem alten, fast quadratisch gefüllten "s" fiel
    // das kaum auf; beim flachen Rundkurs blieb wenig übrig.
    icons: [
      {
        src: "/icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon/512",
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
    // Langes Drücken auf das App-Icon (Android) bzw. Kontextmenü (Desktop).
    // Die Aufzeichnung zuerst: sie ist der Grund, die App unterwegs
    // überhaupt zu öffnen, und sie funktioniert auch ohne Empfang (der
    // Service Worker hält /fahrten/neu vorgeladen, public/sw.js).
    shortcuts: KURZBEFEHLE.map((k) => ({
      name: k.name,
      short_name: k.kurzname,
      description: k.beschreibung,
      url: k.url,
      icons: [
        {
          src: `/kurzbefehl-icon?art=${k.art}`,
          sizes: "192x192",
          type: "image/png",
        },
      ],
    })),
  };
}
