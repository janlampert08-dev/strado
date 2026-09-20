// Empfehlung auf der Startseite ("Für dich empfohlen").
//
// Eine Hierarchie aus einer statt aus dreien: Mit Standort ist die erste
// Zeile der (nach Nähe sortierten) Liste die nächste Strecke — und nennt
// ihren Grund gleich mit ("12 km von dir"). Ohne Standort fällt die
// Empfehlung auf die bestbewertete Strecke zurück (Schnitt, dann Anzahl),
// und erst wenn es gar keine Wertung gibt, auf die erste der Liste. Es
// steht also immer genau eine da, ausser bei Suche oder Ladefehler: Eine
// Suche ist eine explizite Absicht, in die keine Empfehlung gehört.
//
// Reine Funktion, damit sie testbar bleibt (siehe empfehlung.test.ts).
// Der Grund reist mit, damit die Liste ehrlich beschriftet ("nächste" vs.
// "bestbewertet") statt eine Nähe zu behaupten, die sie nicht kennt.
import type { Streckenbewertung } from "@/lib/bewertungen";

export type Empfehlungsgrund = "naehe" | "bewertung" | "bestand";

export interface Empfehlung {
  id: string;
  grund: Empfehlungsgrund;
}

export function waehleEmpfohleneStrecke(
  routeIds: string[],
  opts: {
    hatStandort: boolean;
    searchQuery: string;
    loadError?: boolean;
    bewertungen?: Record<string, Streckenbewertung>;
  },
): Empfehlung | null {
  if (opts.loadError) return null;
  if (opts.searchQuery.trim() !== "") return null;
  if (routeIds.length === 0) return null;
  // Nächste Strecke: visibleRoutes ist bei bekanntem Standort bereits nach
  // Distanz sortiert (ExploreView.tsx), die erste Zeile ist also die Antwort.
  if (opts.hatStandort) return { id: routeIds[0], grund: "naehe" };

  // Ohne Standort: höchste Wertung, Gleichstand nach Anzahl entschieden.
  const bewertungen = opts.bewertungen ?? {};
  let beste: string | null = null;
  let bestSchnitt = -Infinity;
  let bestAnzahl = -1;
  for (const id of routeIds) {
    const wertung = bewertungen[id];
    if (!wertung) continue;
    if (
      wertung.schnitt > bestSchnitt ||
      (wertung.schnitt === bestSchnitt && wertung.anzahl > bestAnzahl)
    ) {
      beste = id;
      bestSchnitt = wertung.schnitt;
      bestAnzahl = wertung.anzahl;
    }
  }
  if (beste !== null) return { id: beste, grund: "bewertung" };

  // Keine einzige Wertung im Bestand: erste Zeile der Grundordnung, damit
  // die Hierarchie auch dann steht. Beschriftet ohne Grund ("Empfehlung"),
  // weil es keinen zu nennen gibt.
  return { id: routeIds[0], grund: "bestand" };
}

// Luftlinie zum Startpunkt, wie sie in der Liste steht. Unter einem
// Kilometer keine Scheingenauigkeit ("0 km"), darüber gerundet.
export function formatEntfernungKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 1) return "weniger als 1 km";
  return `${Math.round(km).toLocaleString("de-CH")} km`;
}
