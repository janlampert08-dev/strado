import type { NextConfig } from "next";
import path from "path";
import { contentSecurityPolicy } from "./lib/csp";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      // Next's default (1 MB) is below both the 4 MB limit uploadAvatar()
      // enforces (lib/actions/profile.ts) and the 8 MB limit
      // logTrackedCompletion() enforces for route photos
      // (lib/actions/completions.ts) — a real photo above the platform
      // limit was rejected with a raw 413 before either friendlier check
      // ever ran. Set above the larger of the two (8 MB) with headroom for
      // the rest of the multipart body (GPS trail JSON, form fields).
      bodySizeLimit: "9mb",
    },
    // Ohne das hier sind Server-Fehler in Vercels Runtime-Error-Tracking
    // nur ein minifizierter Stacktrace ohne Datei/Zeile (z.B.
    // "at <unknown> (chunks/ssr/_1v-t1gi._.js:1:943)") — unbrauchbar zum
    // Debuggen. Betrifft nur Server-Bundles (anders als
    // productionBrowserSourceMaps), die nie an den Client ausgeliefert
    // werden — kein Leak-Risiko, nur etwas grösserer/langsamerer Build.
    serverSourceMaps: true,
  },
  // Sicherheits-Header. Ab hier alle scharf — auch die CSP, die zuvor nur
  // als Content-Security-Policy-Report-Only auslieferte. Report-Only war als
  // Beobachtungsphase gedacht ("erst beobachten, dann durchsetzen"), hat aber
  // nie beobachtet: es war kein report-uri/report-to gesetzt, also ging jeder
  // Verstoss in die Browser-Konsole des jeweiligen Besuchers und sonst
  // nirgendwohin. Eine Policy, die nichts durchsetzt und niemanden
  // benachrichtigt, ist keine Massnahme.
  //
  // Die Policy selbst steht in lib/csp.ts — dort mit der Herleitung jeder
  // Direktive und, anders als hier, mit einer Testdatei daneben
  // (lib/csp.test.ts). next.config.ts lädt Vitest nicht.
  async headers() {
    const csp = contentSecurityPolicy(process.env.NODE_ENV !== "production");

    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking. Besonders relevant, weil /anmelden über ?next=
          // gezielt ansteuerbar ist: ohne frame-ancestors liesse sich das
          // Anmeldeformular in einem fremden Rahmen unterschieben.
          { key: "X-Frame-Options", value: "DENY" },
          // Kein MIME-Sniffing auf ausgelieferte Antworten.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Die Fahrtseite trägt signierte Supabase-Storage-URLs mit
          // ?token=… im DOM (lib/storageUrls.ts, 1 h gültig). Ohne
          // Referrer-Policy ginge die vollständige URL beim Klick auf einen
          // externen Link als Referer mit — inklusive Token.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Keine der drei Berechtigungen wird gebraucht. Geolocation
          // ausdrücklich NICHT gesperrt: die Fahrtaufzeichnung lebt davon.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
  images: {
    // Hochgeladene Fotos/Avatare liegen in Supabase Storage — auf den
    // Storage-Pfad eingeschränkt statt den ganzen Host freizugeben.
    remotePatterns: [
      {
        // Avatare (öffentlicher Bucket).
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Fahrt-Fotos: seit 0061 privater Bucket, die Links werden
        // serverseitig signiert (lib/storageUrls.ts) und liegen deshalb
        // unter /sign/ statt unter /public/.
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
};

export default nextConfig;
