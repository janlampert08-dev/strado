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
    { url: `${origin}/ranglisten`, changeFrequency: "daily", priority: 0.6 },
    // Die Passliste ist nach den Streckenseiten der zweite Evergreen-Inhalt
    // und beantwortet eine Frage, die saisonal gestellt wird ("welche Pässe
    // sind offen?"). Täglich, weil der Status täglich anders sein kann.
    { url: `${origin}/paesse`, changeFrequency: "daily", priority: 0.7 },
    { url: `${origin}/premium`, changeFrequency: "weekly", priority: 0.5 },
    // Der Erklärtext zum Verifiziert-Abzeichen: die kanonische Fassung einer
    // Aussage, die sonst nur als Blatt über anderen Seiten liegt
    // (components/VerifiziertAbzeichen.tsx). Selten ändernd, oft verlinkt.
    { url: `${origin}/verifiziert`, changeFrequency: "monthly", priority: 0.4 },
    ...routes.map((route) => ({
      url: `${origin}/strecken/${route.id}`,
      lastModified: route.created_at,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
