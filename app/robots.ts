import type { MetadataRoute } from "next";
import { getOrigin } from "@/lib/utils/url";
import { istStaging } from "@/lib/staging";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getOrigin();

  // Staging trägt denselben Inhalt wie die Produktion, ist aus eigenem
  // Antrieb öffentlich erreichbar (Vercels Deployment Protection muss aus
  // bleiben, damit Stripe seine Sandbox-Webhooks zustellen kann) und würde
  // sonst mit app.strado.ch um dieselben Suchbegriffe konkurrieren. Kein
  // sitemap-Verweis: eine Sitemap, die zu lauter gesperrten Adressen führt,
  // ist bestenfalls Lärm.
  if (istStaging(new URL(origin).hostname)) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Hier stehen nur noch Bereiche, die ein Crawler gar nicht erst
      // abrufen soll. Das ist etwas anderes als "soll nicht im Index
      // stehen", und die beiden Werkzeuge schliessen sich gegenseitig aus:
      //
      //   Disallow  verbietet das ABRUFEN. Eine verlinkte, aber gesperrte
      //             Adresse landet trotzdem im Index — nur ohne Inhalt, als
      //             nackte URL. Und der Crawler findet ein noindex auf ihr
      //             nie, weil er sie nicht holen darf.
      //   noindex   hält sie aus dem Index heraus, setzt aber voraus, dass
      //             sie abgerufen werden darf.
      //
      // Genau das stand hier schon für /fahrer (siehe unten) — galt aber
      // nicht für /anmelden und /registrieren, obwohl deren Lage dieselbe
      // ist: components/RatingSection.tsx verlinkt
      // /anmelden?next=/strecken/<id> von jeder öffentlichen Streckenseite
      // aus, und die stehen in der Sitemap. Der Crawler fand die Adresse
      // also, durfte sie nicht holen und konnte sie nur als inhaltslose URL
      // führen — mit einer eigenen Variante je ?next=-Wert. Beide tragen
      // jetzt robots: { index: false } auf der Seite selbst
      // (lib/seo.ts, NICHT_INDEXIEREN) und sind hier entfallen.
      //
      // Was stehen bleibt, bleibt aus je eigenem Grund:
      //
      // - /profil, /aktivitaet, /moderation werden ausschliesslich aus
      //   angemeldeten Oberflächen heraus verlinkt (Header, Premium- und
      //   Moderationsseiten). Ein Crawler stösst nie auf den Link, und
      //   abgemeldet leiten sie ohnehin auf /anmelden um — es gibt dort
      //   nichts zu indexieren und nichts zu holen.
      // - /api liefert JSON. Dort geht es nicht um den Index, sondern um
      //   Last: die Strecken-Endpunkte sind unauthentifiziert und nur per
      //   IP gebremst (lib/rateLimit.ts).
      //
      // /fahrer steht bewusst NICHT hier. Fahrer-Profile sollen nicht in
      // den Index — app/sitemap.ts lässt sie aus Datenschutzgründen aus —,
      // aber ein Disallow leistet das nicht, siehe oben. Durchgesetzt wird
      // es mit robots: { index: false } in app/fahrer/[id]/page.tsx.
      disallow: ["/profil", "/moderation", "/api", "/aktivitaet"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
