// Tastatursteuerung für Reiter- und Segmentleisten (roving tabindex): Nur
// das gewählte Element steht in der Tab-Reihenfolge, die Pfeiltasten
// wandern innerhalb der Leiste. So verlangt es das ARIA-Muster für
// role="tablist" und role="radiogroup" — vorher musste man sich mit Tab
// durch jeden einzelnen Reiter arbeiten, und die Pfeiltasten taten nichts.
//
// Rein und ohne DOM, damit es sich testen lässt; die Komponenten
// (components/ui/AbschnittTabs.tsx, components/ui/SegmentedControl.tsx)
// setzen nur Fokus und Auswahl.

/**
 * Wohin eine Taste von `aktuell` aus führt, bei `anzahl` Elementen — oder
 * null, wenn die Taste die Leiste nichts angeht. Am Ende geht es vorne
 * weiter und umgekehrt.
 *
 * `senkrecht`: ArrowUp/ArrowDown zählen mit (Radiogruppen tun das, eine
 * waagrechte Reiterleiste nach dem ARIA-Muster nicht — dort bleiben sie
 * beim Scrollen der Seite).
 */
export function zielIndex(
  taste: string,
  aktuell: number,
  anzahl: number,
  { senkrecht = false }: { senkrecht?: boolean } = {},
): number | null {
  if (anzahl <= 0) return null;
  const von = Math.min(Math.max(aktuell, 0), anzahl - 1);
  switch (taste) {
    case "ArrowRight":
      return (von + 1) % anzahl;
    case "ArrowLeft":
      return (von - 1 + anzahl) % anzahl;
    case "ArrowDown":
      return senkrecht ? (von + 1) % anzahl : null;
    case "ArrowUp":
      return senkrecht ? (von - 1 + anzahl) % anzahl : null;
    case "Home":
      return 0;
    case "End":
      return anzahl - 1;
    default:
      return null;
  }
}
