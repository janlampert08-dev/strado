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
  // Sicherheits-Header. Ab hier alle scharf — auch die CSP, die zuvor nur
  // als Content-Security-Policy-Report-Only auslieferte. Report-Only war als
  // Beobachtungsphase gedacht ("erst beobachten, dann durchsetzen"), hat aber
  // nie beobachtet: es war kein report-uri/report-to gesetzt, also ging jeder
  // Verstoss in die Browser-Konsole des jeweiligen Besuchers und sonst
  // nirgendwohin. Eine Policy, die nichts durchsetzt und niemanden
  // benachrichtigt, ist keine Massnahme.
  //
  // Die Origin-Liste unten ist deshalb aus dem Code hergeleitet statt aus der
  // Beobachtung, und an den Stellen, an denen ein Dritter seine eigenen
  // Endpunkte jederzeit erweitern kann (Stripe), bewusst als Wildcard über
  // dessen eigene Domain gefasst — ein übersehener Unter-Endpunkt bricht sonst
  // lautlos die Bezahlseite. Herleitung je Direktive:
  //
  // - Mapbox GL (components/RouteMap.tsx) kommt aus dem Bundle, nicht von
  //   einer CDN, holt Style/Sprites/Glyphen/Kacheln von api.mapbox.com, meldet
  //   Nutzung an events.mapbox.com (beides *.mapbox.com) und erzeugt seine
  //   Worker aus Blobs — daher worker-src blob:. child-src steht als Fallback
  //   für Browser ohne worker-src daneben.
  // - Stripe (components/PremiumCheckoutForm.tsx): Skript von js.stripe.com,
  //   Iframes von js.stripe.com/hooks.stripe.com (3-D Secure) und
  //   m.stripe.network (Betrugserkennung, eigene Domain — nicht von
  //   *.stripe.com abgedeckt), Netzverkehr an mehrere *.stripe.com-Hosts
  //   (api., q., r., merchant-ui-api.).
  // - Supabase: REST/Auth/Storage über *.supabase.co, Bilder ebenso (signierte
  //   Storage-URLs, lib/storageUrls.ts). Kein Realtime im Einsatz, deshalb
  //   kein wss:.
  // - api.open-meteo.com: Wetter auf der Streckenseite.
  // - Nicht in der Liste, weil serverseitig geholt und damit nie vom Browser:
  //   api3.geo.admin.ch (lib/elevation.ts) sowie overpass-api.de und
  //   maps.zh.ch (scripts/, laufen unter Node).
  // - @vercel/analytics lädt in Produktion /_vercel/insights/script.js von der
  //   eigenen Origin; nur im Dev-Modus kommt das Debug-Skript von
  //   va.vercel-scripts.com, siehe entwicklungsQuellen unten.
  //
  // Bleibende Schwäche, bewusst und benannt: script-src trägt weiterhin
  // 'unsafe-inline' und 'unsafe-eval'. Next injiziert Inline-Skripte, und der
  // saubere Ersatz sind Nonces — die verlangen, dass die CSP pro Anfrage in
  // der Middleware (proxy.ts) erzeugt wird, was jede Seite dynamisch macht.
  // Das ist ein eigener Umbau. Bis dahin schützt script-src nur gegen fremde
  // Skript-Origins, nicht gegen eingeschleustes Inline-Skript; alle übrigen
  // Direktiven wirken davon unabhängig.
  async headers() {
    // Im Dev-Modus zusätzlich erlaubt: Turbopacks HMR-Websocket und das
    // Debug-Skript von @vercel/analytics. Beides gibt es in Produktion nicht,
    // und beides würde die scharfe Policy sonst lokal brechen — was den
    // einzigen Ort entwertet, an dem ein Verstoss vor dem Deploy auffällt.
    const istEntwicklung = process.env.NODE_ENV !== "production";
    const dev = (...quellen: string[]) => (istEntwicklung ? quellen : []);

    const csp = [
      ["default-src", "'self'"],
      [
        "script-src",
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://js.stripe.com",
        ...dev("https://va.vercel-scripts.com"),
      ],
      ["worker-src", "'self'", "blob:"],
      ["child-src", "'self'", "blob:"],
      ["style-src", "'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      ["font-src", "'self'", "data:", "https://fonts.gstatic.com"],
      [
        "img-src",
        "'self'",
        "data:",
        "blob:",
        "https://*.supabase.co",
        "https://*.mapbox.com",
        "https://*.stripe.com",
      ],
      [
        "connect-src",
        "'self'",
        "https://*.supabase.co",
        "https://*.mapbox.com",
        "https://api.open-meteo.com",
        "https://*.stripe.com",
        "https://m.stripe.network",
        ...dev("ws:"),
      ],
      ["frame-src", "https://*.stripe.com", "https://m.stripe.network"],
      ["frame-ancestors", "'none'"],
      ["base-uri", "'self'"],
      // Zwei Formulare der App führen auf eine fremde Adresse, beide zu
      // Stripe:
      //
      // 1. <form action={createPortalSession}> in components/PremiumCard.tsx
      //    legt eine Portal-Sitzung an und leitet auf deren URL weiter
      //    (billing.stripe.com, lib/actions/billing.ts). Mit Javascript ist
      //    das eine Navigation und form-action gar nicht zuständig; ohne
      //    Javascript wird daraus ein echter Formular-POST mit Weiterleitung,
      //    und den blockieren Firefox und Safari unter form-action 'self'.
      //
      // 2. checkout.confirm() für eine Weiterleitungs-Zahlungsart, also für
      //    TWINT — die für ein Schweizer Produkt wichtigste. Stripe.js schickt
      //    dafür ein Formular an einen eigenen Zwischenhost (hooks. bzw.
      //    checkout.stripe.com), von dem aus es weiter zur Bank geht. Genau
      //    dieser erste Sprung stand hier nicht in der Liste: unter
      //    form-action 'self' https://billing.stripe.com blockierte Safari
      //    ihn stillschweigend, das Bezahl-Formular blieb auf "Wird
      //    verarbeitet…" stehen, und im Log war nichts zu sehen, weil der
      //    Verstoss nur in der Browser-Konsole landet.
      //
      // Deshalb jetzt die Wildcard über Stripes eigene Domain statt einer
      // Aufzählung einzelner Hosts — dieselbe Begründung wie oben bei
      // connect-src und frame-src: welchen Zwischenhost Stripe für eine
      // Zahlungsart wählt, ist deren Sache und kann sich ändern. Nur der
      // erste Sprung braucht die Erlaubnis; danach gilt die CSP der
      // Stripe-Seite, nicht mehr unsere.
      ["form-action", "'self'", "https://*.stripe.com"],
      ["object-src", "'none'"],
    ]
      .map((direktive) => direktive.join(" "))
      .join("; ");

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
