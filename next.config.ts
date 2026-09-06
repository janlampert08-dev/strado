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
