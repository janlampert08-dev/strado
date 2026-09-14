import { Signet } from "@/components/Wortmarke";
import { cn } from "@/lib/utils/cn";

/**
 * Das Signet hinter einem Anzeigenamen — das Abzeichen für ein Konto, das
 * Strado unterstützt und das Abzeichen eingeschaltet hat.
 *
 * Gerendert wird es nur, wenn `zeigen` wahr ist. Diese Entscheidung fällt
 * nicht hier und auch nicht im Aufrufer, sondern in der Datenbank:
 * profiles.zeigt_premium_abzeichen ist generiert aus (ist_premium and
 * zeigt_premium_badge), siehe 0087. Der Aufrufer reicht diesen einen Wert
 * durch — wer hier zwei Bedingungen verknüpft, hat die falsche Spalte
 * gelesen.
 *
 * Warum es nicht selbst zeichnet: das Signet gibt es schon als
 * components/Wortmarke.tsx → <Signet>. Diese Komponente legt nur zwei Dinge
 * fest, die dort nicht hingehören — die Grösse im Verhältnis zur Schrift und
 * die Bedeutung fürs Vorlesen.
 *
 * GRÖSSE. Das Zeichen ist 92 × 54 (Verhältnis ≈ 1.7), also breiter als hoch.
 * Es wird über die HÖHE bemessen, die Breite folgt aus dem viewBox — eine
 * quadratische Klasse staucht es, und gestaucht wird die Punze zum Strich.
 * 0.62em hält es unter der Versalhöhe des Namens, damit es nicht wie ein
 * zweites Wort wirkt.
 *
 * Die Untergrenze von 8px ist kein gerundeter Geschmackswert. Die vertikale
 * Wandstärke des Rings beträgt (27 − 14.5) / 54 ≈ 23 % der Höhe: bei 8px sind
 * das rund 1.8px Wand und 4.3px Loch. Darunter schliesst sich die Punze und
 * aus dem Rundkurs wird ein Fleck — derselbe Effekt, wegen dem
 * scripts/generate-favicon.mjs den 16-px-Rahmen bewusst grösser zeichnet als
 * die anderen. Bei sehr kleiner Umgebungsschrift gewinnt deshalb der feste
 * Wert, nicht das em.
 *
 * VORLESEN. <Signet> selbst trägt aria-hidden, weil es dort immer neben
 * einem Text steht, der die Marke schon nennt. Hier ist das anders: das
 * Zeichen TRÄGT die Information. Sie darf nicht verlorengehen, also sitzt sie
 * auf dem umschliessenden <span> — das innere SVG bleibt unverändert
 * schmückend.
 */
export default function PremiumSignet({
  zeigen,
  className,
}: {
  zeigen: boolean;
  className?: string;
}) {
  if (!zeigen) return null;

  return (
    <span
      role="img"
      aria-label="Unterstützt Strado mit Premium"
      title="Unterstützt Strado mit Premium"
      className={cn("ml-1.5 inline-flex shrink-0 items-center text-accent", className)}
    >
      <Signet className="h-[max(8px,0.62em)] w-auto" />
    </span>
  );
}
