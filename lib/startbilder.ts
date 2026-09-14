// Die Startbilder für iOS ("apple-touch-startup-image").
//
// Vom Home-Bildschirm gestartet zeigt iOS zwischen Antippen und erstem Frame
// eine leere Fläche in background_color (app/manifest.ts, #fafafa) — also
// ein weisses Blatt. Ein Startbild füllt diese Sekunde mit der Marke.
//
// Die Bedingung, die das unangenehm macht: Safari nimmt ein Startbild nur,
// wenn die Media-Abfrage GENAU auf das Gerät passt — device-width,
// device-height und Pixeldichte. Ein Bild "für alle" gibt es nicht, deshalb
// diese Tabelle. Wo kein Eintrag passt, bleibt es beim bisherigen Verhalten
// (leere Fläche in background_color), es wird also nichts schlechter.
//
// Bewusst nur iPhones im Hochformat:
//
//   - Jeder Eintrag ist ein <link> im Kopf JEDER Seite, für jeden Browser,
//     auch für die, die ihn nie brauchen. Zehn Einträge sind rund 1 KB pro
//     Anfrage; die iPad-Grössen und das Querformat würden das verdoppeln,
//     für eine Nutzung, die diese App (Beifahrer-Halterung, Hochformat)
//     kaum hat.
//   - Vom Home-Bildschirm gestartet wird im Hochformat.
//
// Die Pixelmaße sind nicht von Hand gepflegt, sondern ergeben sich aus
// Punktmaß × Pixeldichte — genau die Zahlen, die die Media-Abfrage prüft.

export type Startbild = {
  /** device-width in CSS-Punkten, wie die Media-Abfrage sie sieht. */
  breite: number;
  /** device-height in CSS-Punkten. */
  hoehe: number;
  /** Pixeldichte (-webkit-device-pixel-ratio). */
  dichte: number;
  /** Nur zur Orientierung beim Pflegen der Tabelle. */
  geraete: string;
};

export const STARTBILDER: readonly Startbild[] = [
  { breite: 375, hoehe: 667, dichte: 2, geraete: "SE (2./3. Gen.), 8, 7, 6s" },
  { breite: 414, hoehe: 896, dichte: 2, geraete: "11, XR" },
  { breite: 375, hoehe: 812, dichte: 3, geraete: "X, XS, 11 Pro, 12 mini, 13 mini" },
  { breite: 414, hoehe: 896, dichte: 3, geraete: "11 Pro Max, XS Max" },
  { breite: 390, hoehe: 844, dichte: 3, geraete: "12, 12 Pro, 13, 13 Pro, 14" },
  { breite: 428, hoehe: 926, dichte: 3, geraete: "12 Pro Max, 13 Pro Max, 14 Plus" },
  { breite: 393, hoehe: 852, dichte: 3, geraete: "14 Pro, 15, 15 Pro, 16, 16e" },
  { breite: 430, hoehe: 932, dichte: 3, geraete: "14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus" },
  { breite: 402, hoehe: 874, dichte: 3, geraete: "16 Pro" },
  { breite: 440, hoehe: 956, dichte: 3, geraete: "16 Pro Max" },
] as const;

/** Die Bildgrösse in echten Pixeln — das, was die Route zeichnen muss. */
export function startbildPixel(bild: Startbild): { breite: number; hoehe: number } {
  return { breite: bild.breite * bild.dichte, hoehe: bild.hoehe * bild.dichte };
}

/**
 * Die Media-Abfrage eines Eintrags.
 *
 * Alle drei Bedingungen müssen drinstehen: ohne die Pixeldichte würden die
 * beiden 414×896-Geräte (iPhone 11 und 11 Pro Max) auf denselben Eintrag
 * zeigen und eines davon ein zu kleines Bild bekommen.
 */
export function startbildMedia(bild: Startbild): string {
  return (
    `(device-width: ${bild.breite}px) and (device-height: ${bild.hoehe}px) ` +
    `and (-webkit-device-pixel-ratio: ${bild.dichte})`
  );
}

/** Die Adresse, unter der app/startbild/route.tsx dieses Bild zeichnet. */
export function startbildUrl(bild: Startbild): string {
  const { breite, hoehe } = startbildPixel(bild);
  return `/startbild?b=${breite}&h=${hoehe}`;
}

/** Fertige Liste für metadata.appleWebApp.startupImage in app/layout.tsx. */
export function startbildEintraege(): { url: string; media: string }[] {
  return STARTBILDER.map((bild) => ({ url: startbildUrl(bild), media: startbildMedia(bild) }));
}

/**
 * Darf die Route diese Grösse zeichnen?
 *
 * Die Route ist öffentlich und unauthentifiziert, und ihre Maße kommen aus
 * der Adresszeile. Ohne diese Prüfung wäre `?b=20000&h=20000` eine Einladung,
 * den Bildrenderer zu beschäftigen. Erlaubt ist deshalb ausschliesslich, was
 * in der Tabelle oben steht.
 */
export function istErlaubteStartbildGroesse(breite: number, hoehe: number): boolean {
  return STARTBILDER.some((bild) => {
    const pixel = startbildPixel(bild);
    return pixel.breite === breite && pixel.hoehe === hoehe;
  });
}
