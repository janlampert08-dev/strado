import { SIGNET, WORTMARKE } from "@/lib/marke";

/**
 * Die Wortmarke als Inline-SVG.
 *
 * Die Höhe kommt vom Aufrufer über className, die Breite ergibt sich aus dem
 * viewBox — deshalb trägt das <svg> selbst kein width/height. fill ist
 * currentColor: die Marke erbt die Textfarbe ihrer Umgebung und braucht damit
 * keine zweite Fassung für das dunkle Schema.
 *
 * @param className Tailwind-Klassen für die Grösse, etwa "h-[18px] w-auto".
 */
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

/**
 * Das "s" der Wortmarke allein, für Stellen, an denen der volle Schriftzug
 * nicht hinpasst.
 *
 * Trägt aria-hidden statt eines Labels, weil es bisher nur schmückend neben
 * einem Text steht. Wer es allein als Link oder Schaltfläche setzt, muss die
 * Beschriftung selbst mitgeben.
 *
 * @param className Tailwind-Klassen für die Grösse.
 */
export function Signet({ className }: { className?: string }) {
  return (
    <svg viewBox={SIGNET.viewBox} className={className} fill="currentColor" aria-hidden="true">
      <path transform={`translate(${SIGNET.einzug} 0)`} d={SIGNET.pfad} />
    </svg>
  );
}
