import type { ExploreRoute } from "@/types/database";

// Kleinschreibung ohne diakritische Zeichen: "zurich" findet "Zürich",
// "neuchatel" findet "Neuchâtel". Wer ohne Umlaut-Tastatur oder auf
// Französisch und Italienisch sucht, bekam sonst keinen Treffer und die
// Meldung, die Strecke gebe es nicht.
function falten(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Einfache Substring-Suche über Name/Region/Start/Ziel — bewusst ohne
// Fuzzy-Matching, damit das Verhalten für Nutzer vorhersehbar bleibt.
export function matchesSearch(route: ExploreRoute, query: string): boolean {
  const q = falten(query.trim());
  if (!q) return true;
  return (
    falten(route.name).includes(q) ||
    falten(route.region).includes(q) ||
    falten(route.start_ort).includes(q) ||
    falten(route.ziel_ort).includes(q)
  );
}
