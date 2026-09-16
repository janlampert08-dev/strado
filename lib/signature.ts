// Automatisch bestimmtes "Signatur-Merkmal" je Strecke — ersetzt manuell
// vergebene Kategorien (kurvig/scenic/passstrasse/freie_fahrt) in der Explore-
// Ansicht durch eine aus den ohnehin vorhandenen Streckendaten abgeleitete
// Eigenschaft. Für jede Strecke wird das Merkmal gewählt, in dem sie
// (perzentilbasiert) im Vergleich zu den anderen Strecken am meisten
// heraussticht.
//
// FRÜHER TRUG DIESE DATEI AUCH FÜNF FARBEN — jetzt nicht mehr, und das ist
// der Punkt. Jedes Merkmal hatte einen festen Hex-Wert (#E8590C, #7C3AED,
// #0EA5E9, #16A34A, #3D5AFE), der in der Explore-Liste gleichzeitig den
// linken Rand, den Hover-Hintergrund, die getönte Fläche hinter der
// Streckenform, die Form selbst UND das Label einfärbte. Drei Probleme
// daran, jedes für sich ausreichend:
//
// 1. Das Label steht in text-xs, die Kontrastschwelle ist also 4,5:1.
//    Gerechnet gegen die echten Hintergrund-Tokens fielen im hellen Theme
//    drei der fünf durch (2,66 / 3,16 / 3,43) und im dunklen zwei
//    (3,45 / 3,83).
// 2. Die Werte waren Konstanten in einer .ts-Datei und wussten nichts von
//    prefers-color-scheme. Sie wurden in KEINEM Theme je umdefiniert —
//    dieselbe Lücke, die app/globals.css für die Statusfarben längst
//    geschlossen hat.
// 3. Fünf Farben mit nicht lernbarer Bedeutung sind auf einem 390-px-Schirm
//    kein Ordnungssystem, sondern Buntheit. Niemand merkt sich, dass
//    Violett "Steigung" heisst — direkt daneben stehen ohnehin das Icon und
//    das Wort.
//
// Die Signatur behält deshalb Icon und Text und verliert die Farbe; Linie,
// linker Rand und Form nehmen --color-accent. Die Perzentil-Logik hier ist
// davon unberührt und bleibt der eigentliche Wert dieser Datei.
// Siehe docs/design-vereinfachung.md, Anhang A4.
import { averageTempolimit } from "@/lib/geo";
import { mitAnzahl } from "@/lib/format";
import type { ExploreRoute } from "@/types/database";

export type SignatureKey = "kehren" | "steigung" | "hoehe" | "tempo" | "laenge";

export interface RouteSignature {
  key: SignatureKey;
  label: string;
}

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


function formatSignature(key: SignatureKey, route: ExploreRoute): string {
  switch (key) {
    case "kehren":
      // kehren ist hier nie null: computeSignatures wählt diesen Schlüssel nur,
      // wenn die Kehrendichte berechenbar war, und das setzt kehren !== null
      // voraus. Das ?? 0 bedient also nur den Typ. Vorher stand hier ein
      // Template-String, der denselben Fall stillschweigend als "null Kehren"
      // gerendert hätte — der Compiler hatte keinen Anlass zu widersprechen.
      return mitAnzahl(route.kehren ?? 0, "Kehre", "Kehren");
    case "steigung":
      return `${route.max_steigung_prozent}% Steigung`;
    case "hoehe":
      // "m hoch", nicht "Höhenmeter": routes.hoehe_m ist die Scheitelhöhe der
      // Strecke, nicht der gesammelte Anstieg. Unter demselben Wort standen
      // beide Grössen nebeneinander — siehe lib/hoehenmeter.ts.
      return `${route.hoehe_m} m hoch`;
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
    });
  });

  return result;
}
