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
 * Das Signet allein — der Rundkurs (lib/marke.ts) —, für Stellen, an denen
 * der volle Schriftzug nicht hinpasst: die Kopfleiste auf schmalen Schirmen
 * und das Ladeskelett.
 *
 * Wie bei der Wortmarke kommt die Höhe vom Aufrufer, die Breite folgt über
 * den viewBox — das Zeichen ist deutlich breiter als hoch (Verhältnis
 * ≈ 1.7), eine quadratische Klasse würde es also stauchen. Richtig ist
 * "h-[18px] w-auto".
 *
 * Trägt aria-hidden statt eines Labels, weil es nie allein steht: entweder
 * schmückend neben einem Text, oder in einem Link bzw. einer Schaltfläche,
 * die den Namen selbst mitbringt (LogoLink.tsx). Wer es woanders allein
 * setzt, muss die Beschriftung mitgeben.
 *
 * @param className Tailwind-Klassen für die Grösse.
 */
export function Signet({ className }: { className?: string }) {
  return (
    <svg viewBox={SIGNET.viewBox} className={className} fill="currentColor" aria-hidden="true">
      <path d={SIGNET.pfad} />
    </svg>
  );
}
