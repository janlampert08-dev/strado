import { SIGNET, WORTMARKE } from "@/lib/marke";

// Die Wortmarke als Inline-SVG. Höhe kommt vom Aufrufer (Tailwind-Klasse),
// die Breite ergibt sich über den viewBox — deshalb kein width/height am
// <svg> selbst. fill="currentColor" heisst: die Marke erbt die Textfarbe und
// funktioniert damit in beiden Farbschemata ohne eigene Fassung.
export default function Wortmarke({ className }: { className?: string }) {
  return (
    <svg
      viewBox={WORTMARKE.viewBox}
      className={className}
      fill="currentColor"
      role="img"
      aria-label="Strado"
    >
      <path d={WORTMARKE.pfad} />
    </svg>
  );
}

// Das "s" allein — für Stellen, an denen die volle Wortmarke nicht hinpasst.
// Ohne aria-label und mit aria-hidden, weil es bisher nur schmückend neben
// einem Text steht; wer es allein als Link setzt, muss selbst beschriften.
export function Signet({ className }: { className?: string }) {
  return (
    <svg viewBox={SIGNET.viewBox} className={className} fill="currentColor" aria-hidden="true">
      <path transform={`translate(${SIGNET.einzug} 0)`} d={SIGNET.pfad} />
    </svg>
  );
}
