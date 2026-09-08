// Automatisch bestimmtes "Signatur-Merkmal" je Strecke — ersetzt manuell
// vergebene Kategorien (kurvig/scenic/passstrasse/freie_fahrt) in der Explore-
// Ansicht durch eine aus den ohnehin vorhandenen Streckendaten abgeleitete
// Eigenschaft. Für jede Strecke wird das Merkmal gewählt, in dem sie
// (perzentilbasiert) im Vergleich zu den anderen Strecken am meisten
// heraussticht. Zwei Strecken mit demselben Merkmal teilen sich dieselbe
// Farbe (Karte + Liste) — die Farbe transportiert also Bedeutung statt nur
// Unterscheidbarkeit.
import { averageTempolimit } from "@/lib/geo";
import type { ExploreRoute } from "@/types/database";

export type SignatureKey = "kehren" | "steigung" | "hoehe" | "tempo" | "laenge";

export interface RouteSignature {
  key: SignatureKey;
  label: string;
  color: string;
}

export const SIGNATURE_COLORS: Record<SignatureKey, string> = {
  kehren: "#E8590C",
  steigung: "#7C3AED",
  hoehe: "#0EA5E9",
  tempo: "#16A34A",
  laenge: "#3D5AFE",
};

// Reihenfolge bei Gleichstand der Perzentile — seltenere/technischere
// Merkmale gewinnen vor der immer vorhandenen Länge, die als einziges Feld
// garantiert nie null ist und daher den Fallback bildet.
const PRIORITY: SignatureKey[] = ["kehren", "steigung", "hoehe", "tempo", "laenge"];

// Perzentilrang jedes vorhandenen Werts innerhalb der übergebenen Liste
// (0 = niedrigster, 1 = höchster vorhandener Wert). null-Werte bleiben null,
// statt fälschlich als 0 in den Vergleich einzugehen.
function percentileRanks(values: (number | null)[]): (number | null)[] {
  const present = values
    .map((v, i) => (v !== null && Number.isFinite(v) ? { v, i } : null))
    .filter((x): x is { v: number; i: number } => x !== null);

  if (present.length === 0) return values.map(() => null);

  const sorted = [...present].sort((a, b) => a.v - b.v);
  const rankOf = new Map<number, number>();

  for (const { i, v } of present) {
    if (present.length === 1) {
      rankOf.set(i, 1);
      continue;
    }
    const below = sorted.filter((s) => s.v < v).length;
    rankOf.set(i, below / (present.length - 1));
  }

  return values.map((_, i) => rankOf.get(i) ?? null);
}

// Wandelt eine Signaturfarbe (immer #rrggbb, siehe SIGNATURE_COLORS) in eine
// transluzente rgba()-Variante um — für Hover-Hintergründe, die dieselbe
// Farbe wie das Signatur-Merkmal tragen sollen, aber nicht deckend sein dürfen.
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatSignature(key: SignatureKey, route: ExploreRoute): string {
  switch (key) {
    case "kehren":
      return `${route.kehren} Kehren`;
    case "steigung":
      return `${route.max_steigung_prozent}% Steigung`;
    case "hoehe":
      return `${route.hoehe_m} Höhenmeter`;
    case "tempo": {
      const avg = averageTempolimit(route.tempolimits);
      return avg !== null ? `Ø ${avg} km/h` : "Freie Fahrt";
    }
    case "laenge":
      return `${route.laenge_km} km lang`;
  }
}

// Berechnet für den gesamten übergebenen Streckenbestand ein stabiles
// Signatur-Merkmal je Strecke. Sollte immer auf dem ungefilterten Bestand
// aufgerufen werden — sonst würde z.B. eine Textsuche die Perzentile (und
// damit Merkmal/Farbe) einzelner Strecken verschieben.
export function computeSignatures(routes: ExploreRoute[]): Map<string, RouteSignature> {
  const kehrenDichte = routes.map((r) =>
    r.kehren !== null && r.laenge_km > 0 ? r.kehren / r.laenge_km : null,
  );
  const steigung = routes.map((r) => r.max_steigung_prozent);
  const hoehe = routes.map((r) => r.hoehe_m);
  const tempo = routes.map((r) => averageTempolimit(r.tempolimits));
  const laenge = routes.map((r) => r.laenge_km);

  const ranks: Record<SignatureKey, (number | null)[]> = {
    kehren: percentileRanks(kehrenDichte),
    steigung: percentileRanks(steigung),
    hoehe: percentileRanks(hoehe),
    tempo: percentileRanks(tempo),
    laenge: percentileRanks(laenge),
  };

  const result = new Map<string, RouteSignature>();

  routes.forEach((route, i) => {
    let best: SignatureKey = "laenge";
    let bestScore = -1;
    for (const key of PRIORITY) {
      const score = ranks[key][i];
      if (score !== null && score > bestScore) {
        bestScore = score;
        best = key;
      }
    }

    result.set(route.id, {
      key: best,
      label: formatSignature(best, route),
      color: SIGNATURE_COLORS[best],
    });
  });

  return result;
}
