// Die alpine Schicht über den Standard-Stilen von Mapbox.
//
// Strado lief auf mapbox/dark-v11 und streets-v12 — denselben Karten wie
// tausend andere Apps, ohne ein Zeichen dafür, dass es hier um Pässe geht
// (Re-Review 2026-09-23). Ein eigener Stil braucht Mapbox Studio und das
// Konto des Inhabers; bis dahin legt diese Datei zur Laufzeit darüber, was
// ohne Konto geht, und nur aus Mapbox' eigenen, mit dem App-Token frei
// nutzbaren Kacheln:
//
//   - Relief (hillshade) aus mapbox-terrain-dem-v1 — derselben Höhenquelle,
//     die die 3D-Ansicht ohnehin lädt.
//   - Höhenlinien aus mapbox-terrain-v2 wie auf der Landeskarte, erst ab
//     Zoom 11, damit die Landesübersicht ruhig bleibt.
//   - Im hellen Schema: Strassen neutral statt orange/gelb und Grünflächen
//     zurückgenommen. Die gefahrene Linie und die Tempofarben sollen die
//     einzigen kräftigen Farben auf der Karte sein.
//
// Alles hier ist reine Beschreibung (Layer-Spezifikationen) und damit
// testbar; RouteMap.tsx wendet es nach jedem "style.load" an.

export type KartenSchema = "hell" | "dunkel";

export const KONTUR_SOURCE = "strado-konturen";
export const RELIEF_LAYER = "strado-relief";
export const KONTUR_LAYER = "strado-konturen";
export const KONTUR_HAUPT_LAYER = "strado-konturen-haupt";

/** Ab dieser Zoomstufe erscheinen Höhenlinien. */
export const KONTUR_AB_ZOOM = 11;

type Farbe = string;

const RELIEF: Record<KartenSchema, { schatten: Farbe; licht: Farbe; akzent: Farbe; staerke: number }> = {
  // Dunkel: Schatten schwarz, Licht kaum heller als der Grund — Relief als
  // Ahnung, nicht als Bild.
  dunkel: { schatten: "#000000", licht: "#2a2b31", akzent: "#15161a", staerke: 0.35 },
  hell: { schatten: "#6b6e78", licht: "#ffffff", akzent: "#9a9dab", staerke: 0.25 },
};

const KONTUR: Record<KartenSchema, { fein: Farbe; haupt: Farbe }> = {
  dunkel: { fein: "rgba(242,242,244,0.06)", haupt: "rgba(242,242,244,0.12)" },
  hell: { fein: "rgba(19,19,22,0.07)", haupt: "rgba(19,19,22,0.14)" },
};

export function reliefLayer(schema: KartenSchema, demSource: string) {
  const r = RELIEF[schema];
  return {
    id: RELIEF_LAYER,
    type: "hillshade" as const,
    source: demSource,
    paint: {
      "hillshade-shadow-color": r.schatten,
      "hillshade-highlight-color": r.licht,
      "hillshade-accent-color": r.akzent,
      "hillshade-exaggeration": r.staerke,
      // Licht aus Nordwest, wie auf jeder Schweizer Landeskarte.
      "hillshade-illumination-direction": 315,
    },
  };
}

export function konturSource() {
  return { type: "vector" as const, url: "mapbox://mapbox.mapbox-terrain-v2" };
}

/** Feine Linien (alle 10 m im Datensatz) und Hauptlinien (index 5/10). */
export function konturLayer(schema: KartenSchema) {
  const k = KONTUR[schema];
  return [
    {
      id: KONTUR_LAYER,
      type: "line" as const,
      source: KONTUR_SOURCE,
      "source-layer": "contour",
      minzoom: KONTUR_AB_ZOOM,
      filter: ["!", ["in", ["get", "index"], ["literal", [5, 10]]]],
      paint: { "line-color": k.fein, "line-width": 0.6 },
    },
    {
      id: KONTUR_HAUPT_LAYER,
      type: "line" as const,
      source: KONTUR_SOURCE,
      "source-layer": "contour",
      minzoom: KONTUR_AB_ZOOM,
      filter: ["in", ["get", "index"], ["literal", [5, 10]]],
      paint: { "line-color": k.haupt, "line-width": 0.9 },
    },
  ];
}

/**
 * Die erste Strassen- oder Gebäudeebene des Stils: Relief und Höhenlinien
 * liegen darunter, damit Strassen, Orte und die eigenen Strecken darüber
 * lesbar bleiben.
 */
export function ersteStrassenEbene(layerIds: readonly string[]): string | undefined {
  return layerIds.find((id) => /^(road|tunnel|bridge|building)/.test(id));
}

// Streets-v12 zeichnet Autobahnen orange, Hauptstrassen gelb und Wald
// kräftig grün. Auf dieser Karte gingen die Tempofarben der eigenen Spur
// (ebenfalls Orange/Amber) und dunkelgrüne Streckenpins unter.
const HELLE_STRASSE_HAUPT = "#d9d9de";
const HELLE_STRASSE = "#ffffff";

/**
 * Welche Farbänderungen das helle Schema an den Standardebenen braucht.
 * Gibt je Ebene die zu setzenden Paint-Eigenschaften zurück; unbekannte
 * Ebenen bleiben unberührt.
 */
export function helleBeruhigung(
  layer: { id: string; type: string },
): Record<string, unknown> | null {
  if (layer.type === "line" && /^(road|tunnel|bridge)-/.test(layer.id) && !/label|shield|case|casing/.test(layer.id)) {
    return {
      "line-color": /motorway|trunk|primary/.test(layer.id) ? HELLE_STRASSE_HAUPT : HELLE_STRASSE,
    };
  }
  if (layer.type === "fill" && /^(landcover|landuse|national-park|park)/.test(layer.id)) {
    return { "fill-opacity": 0.35 };
  }
  return null;
}
