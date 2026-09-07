import type { MetadataRoute } from "next";
import { getOrigin } from "@/lib/utils/url";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Auth-/Einstellungs-/Moderationsbereiche sind nicht öffentlich
      // teilbar und bringen für die Indexierung keinen Wert.
      //
      // /anmelden und /registrieren sind Formulare ohne Inhalt; /aktivitaet
      // ist der persönliche Rückkanal und ohnehin nur angemeldet sichtbar.
      //
      // /fahrer steht bewusst NICHT hier. Fahrer-Profile sollen nicht in
      // den Index — app/sitemap.ts lässt sie aus Datenschutzgründen aus —,
      // aber ein Disallow leistet das nicht: es verbietet das Abrufen, nicht
      // das Indexieren, und /feed verlinkt jedes dieser Profile. Die URL
      // landete also weiterhin im Index, nur ohne Inhalt. Durchgesetzt wird
      // es stattdessen mit robots: { index: false } in
      // app/fahrer/[id]/page.tsx — was voraussetzt, dass der Crawler die
      // Seite überhaupt holen darf.
      disallow: ["/profil", "/moderation", "/api", "/aktivitaet", "/anmelden", "/registrieren"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
