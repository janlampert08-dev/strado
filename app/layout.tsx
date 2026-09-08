import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { BESCHREIBUNG, SLOGAN } from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Für tabellarische Zahlen (Ränge, km, Höhenmeter) — Instrument-Cluster-artige
// Präzision statt Inter als De-facto-Mono-Attrappe (siehe globals.css).
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
});

// Für die Auflösung relativer URLs in opengraph-image/twitter-image nötig
// (sonst Next-Build-Warnung, Fallback auf localhost). VERCEL_PROJECT_PRODUCTION_URL
// ist die stabile Produktions-Domain, von Vercel automatisch gesetzt.
const metadataBase = new URL(
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000",
);

export const metadata: Metadata = {
  metadataBase,
  // Der Titel der Startseite kommt aus app/page.tsx; dieser hier greift für
  // alle Seiten ohne eigenes generateMetadata.
  title: "Strado",
  description: BESCHREIBUNG,
  // Bis hierher gab es im ganzen Projekt kein einziges openGraph- oder
  // twitter-Feld (grep über app/**). Die App hat aber einen ausdrücklichen
  // Teilen-Knopf und öffentliche Fahrt-URLs — geteilte Links rendern in
  // WhatsApp, Slack oder X sonst ohne Karte, ohne Sprachangabe und ohne
  // Absender. Die dateibasierten opengraph-image.tsx liefern das Bild, die
  // Metadaten drumherum fehlten.
  openGraph: {
    type: "website",
    locale: "de_CH",
    siteName: "Strado",
    title: `Strado — ${SLOGAN}`,
    description: BESCHREIBUNG,
  },
  twitter: {
    card: "summary_large_image",
  },
  appleWebApp: {
    // "standalone" entfernt die Safari-Chrome, sobald die Seite via
    // "Zum Home-Bildschirm" installiert ist — Grundvoraussetzung dafür,
    // dass sich die App wie eine native iOS-App anfühlt statt wie eine
    // im Browser geöffnete Website.
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Strado",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lässt den Seiteninhalt bis unter Notch/Dynamic Island bzw. Home-Indicator
  // laufen — erst dadurch greifen die env(safe-area-inset-*)-Werte, die
  // globals.css und die Bottom-Nav für Abstände dort nutzen.
  viewportFit: "cover",
  // Folgt der Systemeinstellung für die Browser-Chrome-Farbe (Statusleiste/
  // Adresszeile). Deckt nicht den seltenen Fall ab, dass jemand über
  // ThemeToggle.tsx manuell gegen sein Systemschema übersteuert — die
  // Chrome-Farbe würde dann kurz nicht zum Seiteninhalt passen, rein
  // kosmetisch und nicht funktional relevant.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0D" },
  ],
};

// Blockierendes Inline-Script statt eines useEffect in ThemeToggle.tsx:
// muss vor dem ersten Paint laufen, sonst blitzt bei einer gespeicherten
// "Dunkel"-Wahl kurz das helle Schema auf (FOUC), bis React hydratisiert.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("cornice-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      // Das Inline-Script unten setzt data-theme ausserhalb von Reacts
      // Kontrolle — ohne dies würde React beim Hydratisieren fälschlich vor
      // einem Mismatch warnen.
      suppressHydrationWarning
      className={`${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorkerRegister />
        <Analytics />
      </body>
    </html>
  );
}
