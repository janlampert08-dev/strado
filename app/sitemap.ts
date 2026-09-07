import type { MetadataRoute } from "next";
import { getOrigin } from "@/lib/utils/url";
import { listRoutesForSitemap } from "@/lib/routes";

// Fahrer-Profile sind bewusst ausgeschlossen — Privatsphäre-Konsistenz mit
// den bestehenden Sichtbarkeits-Flags (siehe lib/profile.ts): ob ein Profil
// überhaupt etwas preisgibt, entscheidet der Nutzer selbst, das soll nicht
// unabhängig davon per Sitemap crawlbar gemacht werden.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getOrigin();
  const routes = await listRoutesForSitemap();

  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/leaderboards`, changeFrequency: "daily", priority: 0.6 },
    ...routes.map((route) => ({
      url: `${origin}/strecken/${route.id}`,
      lastModified: route.created_at,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
