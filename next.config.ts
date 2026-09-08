import type { NextConfig } from "next";
import path from "path";

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
  // Sicherheits-Header. Bis auf die CSP alle scharf; die CSP läuft
  // absichtlich zunächst nur im Report-Only-Modus, siehe unten.
  async headers() {
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
          // Kamera und Mikrofon braucht die Anwendung nirgends. Geolocation
          // ausdrücklich NICHT gesperrt: die Fahrtaufzeichnung lebt davon.
          //
          // payment: seit Premium live ist, braucht die Kaufseite die
          // Berechtigung. Das Payment Element läuft in einem iframe von
          // js.stripe.com und bietet dort Apple Pay / Google Pay über die
          // Payment Request API an. Mit payment=() verweigert der Browser
          // das dem iframe, Stripe.js meldet die fehlende Berechtigung in
          // der Konsole und blendet im Formular einen Hinweis ein — die
          // Zahlung selbst lief zwar durch, aber mit einer Warnung, die
          // ausgerechnet auf der Bezahlseite steht.
          //
          // Freigegeben wird deshalb genau so eng wie nötig: die eigene
          // Herkunft und js.stripe.com, kein "*". Das ist die Erlaubnis,
          // die die Anwendung tatsächlich braucht, keine Lockerung ins
          // Blaue — jede andere Fremd-Herkunft bleibt gesperrt.
          {
            key: "Permissions-Policy",
            value: 'camera=(), microphone=(), payment=(self "https://js.stripe.com")',
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Report-Only: Mapbox GL (Worker + WebGL), Stripe Elements
          // (Iframe + eigenes Skript) und Supabase Storage hängen an
          // mehreren Fremd-Origins. Scharf geschaltet würde ein
          // übersehener Origin die Karte oder die Bezahlseite lautlos
          // brechen — und beides lässt sich hier nicht gegen eine laufende
          // Anwendung prüfen. Erst beobachten, dann durchsetzen.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              // 'unsafe-inline'/'unsafe-eval': Next injiziert Inline-Skripte,
              // Mapbox GL erzeugt Worker aus Blobs. Beim Scharfschalten
              // durch Nonces ersetzen.
              //
              // *.js.stripe.com neben js.stripe.com: Stripe.js lädt Teile
              // seines Codes nach und startet seine Frames wo möglich auf
              // wechselnden Unter-Herkünften, damit sie sich gegenseitig
              // nicht ausbremsen (Stripe, Integration security guide →
              // Content Security Policy). Ohne den Eintrag bricht das
              // scharf geschaltet mitten im Bezahlen ab.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.js.stripe.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              // q.stripe.com: Stripe.js meldet von der eigenen Seite aus
              // Messwerte über ein Bild-Pixel dorthin (nachgeprüft im
              // ausgelieferten js.stripe.com/v3: `(new Image).src` auf
              // diese Adresse). Das ist ein img-src der Seite selbst, kein
              // Aufruf aus Stripes iframe heraus — den beträfe unsere CSP
              // gar nicht.
              "img-src 'self' data: blob: https://*.supabase.co https://*.mapbox.com https://q.stripe.com",
              // fonts.googleapis.com auch hier, nicht nur in style-src:
              // PremiumCheckoutForm reicht dem Payment Element eine
              // Schrift als `fonts: [{ cssSrc }]` weiter, und diese CSS
              // holt Stripe.js von unserer Seite aus — Stripe verlangt sie
              // deshalb ausdrücklich in connect-src.
              "connect-src 'self' https://*.supabase.co https://*.mapbox.com https://api.open-meteo.com https://api.stripe.com https://fonts.googleapis.com",
              // hooks.stripe.com trägt die Weiterleitungsverfahren (3D
              // Secure, TWINT). Bewusst NICHT aufgenommen: m.stripe.com
              // (Betrugserkennung) und m.stripe.network — beide werden aus
              // Stripes eigenen Frames heraus angesprochen und fallen unter
              // deren CSP, nicht unter unsere. Sie hier zu führen, wäre
              // eine Freigabe für nichts.
              "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
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
