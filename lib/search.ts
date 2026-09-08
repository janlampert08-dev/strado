import type { ExploreRoute } from "@/types/database";

// Einfache Substring-Suche über Name/Region/Start/Ziel — bewusst ohne
// Fuzzy-Matching, damit das Verhalten für Nutzer vorhersehbar bleibt.
export function matchesSearch(route: ExploreRoute, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    route.name.toLowerCase().includes(q) ||
    route.region.toLowerCase().includes(q) ||
    route.start_ort.toLowerCase().includes(q) ||
    route.ziel_ort.toLowerCase().includes(q)
  );
}
