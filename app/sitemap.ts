import type { MetadataRoute } from "next";
import { getOrigin } from "@/lib/utils/url";
import { siteUrl } from "@/lib/siteUrl";
import { listRoutesForSitemap, type RouteSitemapEintrag } from "@/lib/routes";

// Immer zur Anfragezeit rendern: die Origin hängt an den Request-Headern
// und die Streckenliste an cookies() — beides ist nie statisch
// vorberechenbar, ohne das versucht der Build ein Prerender, das nur in den
// statischen Fallback läuft. Ein `revalidate` daneben wäre wirkungslos
// (force-dynamic rendert jeden Abruf neu); was Googlebot vor "Couldn't
// fetch" schützt, ist das Zeitbudget mit Rückfall unten, nicht ein Cache.
export const dynamic = "force-dynamic";

// Zeitbudget für die Streckenabfrage: reisst die DB, antwortet die Sitemap
// trotzdem mit den statischen Adressen statt mit einem 500er (für Googlebot
// ebenfalls "Couldn't fetch"). 8 s lassen der Abfrage Luft, bleiben aber
// deutlich unter dem Vercel-Function-Timeout.
const STRECKEN_TIMEOUT_MS = 8000;

async function ladeStrecken(): Promise<RouteSitemapEintrag[]> {
  try {
    const ergebnis = await Promise.race([
      listRoutesForSitemap(),
      new Promise<null>((loese) => setTimeout(() => loese(null), STRECKEN_TIMEOUT_MS)),
    ]);
    return ergebnis ?? [];
  } catch (fehler) {
    console.error(
      "Sitemap: Streckenliste fehlgeschlagen, liefere statische Adressen:",
      fehler instanceof Error ? fehler.message : fehler,
    );
    return [];
  }
}

// Die Origin kommt aus den Request-Headern (Vorschau-Deployments zeigen auf
// sich selbst); fällt das weg, gilt die konfigurierte Produktions-Domain
// statt einer kaputten oder fehlenden Angabe.
async function bestimmeOrigin(): Promise<string> {
  try {
    const origin = await getOrigin();
    new URL(origin);
    return origin;
  } catch {
    return siteUrl();
  }
}

// Fahrer-Profile sind bewusst ausgeschlossen — Privatsphäre-Konsistenz mit
// den bestehenden Sichtbarkeits-Flags (siehe lib/profile.ts): ob ein Profil
// überhaupt etwas preisgibt, entscheidet der Nutzer selbst, das soll nicht
// unabhängig davon per Sitemap crawlbar gemacht werden.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await bestimmeOrigin();
  const routes = await ladeStrecken();

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
