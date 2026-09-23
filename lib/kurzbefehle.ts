// Die App-Verknüpfungen im PWA-Manifest (app/manifest.ts, "shortcuts"):
// langes Drücken auf das Home-Bildschirm-Icon zeigt sie auf Android, auf dem
// Desktop stehen sie im Kontextmenü der installierten App. Eine Tabelle, weil
// zwei Stellen dieselben Einträge brauchen — das Manifest und die Route, die
// die Icons zeichnet (app/kurzbefehl-icon/route.tsx) — und die Route ihren
// Parameter gegen genau diese Liste prüft statt gegen irgendeinen String.

export interface Kurzbefehl {
  art: string;
  name: string;
  kurzname: string;
  beschreibung: string;
  url: string;
  // SVG-Inhalt auf einer 24er-Fläche, als Kontur gezeichnet — dieselbe
  // Strichsprache wie die übrigen Symbole der App (components/NavIcons.tsx).
  glyphe: string;
}

export const KURZBEFEHLE: readonly Kurzbefehl[] = [
  {
    art: "aufzeichnen",
    name: "Fahrt aufzeichnen",
    kurzname: "Aufzeichnen",
    beschreibung: "Eine freie Fahrt aufzeichnen — auch ohne Empfang.",
    url: "/fahrten/neu",
    // Aufnahmeknopf: Ring mit vollem Kern. Der Kern ist ein Strich, der breiter
    // ist als sein Radius, statt einer Füllung — so braucht die Glyphe nur die
    // eine Strichfarbe und kein currentColor, das Satori nicht auflöst.
    glyphe: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2" stroke-width="4"/>',
  },
  {
    art: "paesse",
    name: "Pässe",
    kurzname: "Pässe",
    beschreibung: "Welche Pässe offen sind und welche gesperrt.",
    url: "/paesse",
    // Passhöhe: zwei Gipfel mit dem Sattel dazwischen.
    glyphe: '<path d="M2 20 L8.5 7 L12 13 L14.5 9.5 L22 20 Z"/>',
  },
];

export function kurzbefehl(art: string | null): Kurzbefehl | null {
  return KURZBEFEHLE.find((k) => k.art === art) ?? null;
}

/**
 * Die Glyphe als data:-URI für Satori (ImageResponse zeichnet ein <img>
 * zuverlässiger als ein Inline-SVG — siehe app/icon.tsx).
 */
export function kurzbefehlGlypheUri(k: Kurzbefehl, farbe: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${farbe}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${k.glyphe}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
