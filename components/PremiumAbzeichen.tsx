import { SparklesIcon } from "@/components/NavIcons";
import { cn } from "@/lib/utils/cn";

/**
 * Das Abzeichen hinter einem Anzeigenamen — für ein Konto, das Strado
 * unterstützt und das Abzeichen eingeschaltet hat.
 *
 * Gerendert wird es nur, wenn `zeigen` wahr ist. Diese Entscheidung fällt
 * nicht hier und auch nicht im Aufrufer, sondern in der Datenbank:
 * profiles.zeigt_premium_abzeichen ist generiert aus (ist_premium and
 * zeigt_premium_badge), siehe 0087. Der Aufrufer reicht diesen einen Wert
 * durch — wer hier zwei Bedingungen verknüpft, hat die falsche Spalte
 * gelesen.
 *
 * ---------------------------------------------------------------------------
 * Warum nicht mehr das Signet
 * ---------------------------------------------------------------------------
 * Bis hierher zeichnete diese Stelle <Signet> aus components/Wortmarke.tsx,
 * den Rundkurs aus lib/marke.ts. Drei Gründe, warum das an einem Namen nicht
 * funktioniert hat:
 *
 * 1. ES IST DIE MARKE, KEIN STATUS. Dasselbe Zeichen ist das App-Icon, das
 *    Favicon, der Zieh-zum-Neuladen-Indikator, der Leerzustand des globalen
 *    Feeds und das Abzeichen auf der Willkommensseite. Auf einer einzigen
 *    Feed-Seite hiess es an einer Stelle "Strado" und an der nächsten
 *    "Premium". Ein Zeichen trägt eine Bedeutung; wer ihm eine zweite gibt,
 *    verliert die erste.
 * 2. DIE FORM STIMMT IN TEXTGRÖSSE NICHT. Das Signet ist 92 × 54, also 1.7-mal
 *    breiter als hoch. Neben text-sm (14 px) stand ein rund 15 px breites,
 *    9 px hohes liegendes Oval auf der Grundlinie — anderthalb Zeichen breit
 *    und flach: das Auge liest so etwas als Satzzeichen oder Strich, nicht
 *    als Abzeichen. Auf den Profilüberschriften (--text-display) war es
 *    25–38 px breit, dort also kein Abzeichen mehr, sondern ein zweites Logo.
 * 3. BLAU IST DIE FARBE DES BEDIENBAREN. Das Zeichen sass in --color-accent
 *    innerhalb eines <a>, direkt hinter dessen Text — es sah nach einem
 *    eigenen Ziel aus und war keines. Der eigene Ton steht jetzt in
 *    app/globals.css (--color-premium), mit der Begründung und den
 *    Kontrastwerten dort.
 *
 * Gezeichnet wird stattdessen das Funkeln aus components/PremiumBadge.tsx:
 * dieselbe Marke wie auf der Kauf- und der Zahlungsseite. Wer das Abzeichen
 * im Feed sieht und später auf der Kaufseite landet, sieht dort dasselbe
 * Zeichen wieder.
 *
 * ---------------------------------------------------------------------------
 * Die beiden Varianten
 * ---------------------------------------------------------------------------
 * "kompakt" (Vorgabe) ist das blosse Zeichen — für Zeilen, in denen der Name
 * ohnehin schon gekürzt wird: Feed, Bestenlisten, Kudos-Liste, Kopf einer
 * Fahrt. Dort ist für ein Wort kein Platz.
 *
 * "mitText" ist die Pille mit dem Wort "Premium" — für die beiden
 * Profilüberschriften, wo Platz ist und wo das Abzeichen zum ersten Mal
 * erklärt werden kann. Ein Zeichen, das niemand deuten kann, wirbt für
 * nichts; das Wort daneben ist der einzige Ort in der App, an dem ein
 * Nicht-Abonnent überhaupt erfährt, dass es das gibt.
 *
 * GRÖSSE. Kompakt wird über die Schriftgrösse bemessen (0.95em), aber nach
 * oben und unten begrenzt: unter 11 px zerfällt das Funkeln in Striche, über
 * 15 px steht es neben einem Namen in --text-display wieder als eigenes
 * Objekt statt als Beigabe. clamp() macht damit beides — die dichte Zeile
 * und die grosse Überschrift — ohne eine zweite Variante.
 *
 * VORLESEN. Das Zeichen TRÄGT die Information, sie darf also nicht
 * verlorengehen. Sie sitzt auf dem umschliessenden <span>, das innere SVG
 * bleibt schmückend. Zwei Feinheiten, beide daher, dass das Abzeichen an den
 * meisten Stellen INNERHALB eines <a> sitzt und damit in den Linknamen
 * einfliesst:
 *
 *   1. Kein title neben dem aria-label. Bei role="img" wird title zur
 *      Beschreibung, und NVDA wie JAWS lesen dann beides — "Anna,
 *      Premium-Unterstützer, Premium-Unterstützer, Link". Der Tooltip für die
 *      Maus hängt deshalb am inneren, aria-hidden Knoten: was aria-hidden
 *      ist, fliesst in keine Namensberechnung ein, der Zeiger findet ihn
 *      trotzdem. Auf Touch gibt es ohnehin keinen.
 *   2. Ein Substantiv, kein Satz. "Unterstützt Strado mit Premium" las sich
 *      einkonkateniert als "Anna Unterstützt Strado mit Premium hat deiner
 *      Fahrt Kudos gegeben".
 */
export default function PremiumAbzeichen({
  zeigen,
  variante = "kompakt",
  className,
}: {
  zeigen: boolean;
  variante?: "kompakt" | "mitText";
  className?: string;
}) {
  if (!zeigen) return null;

  if (variante === "mitText") {
    return (
      <span
        title={TOOLTIP}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full bg-premium-subtle px-2 py-0.5 align-middle text-xs font-semibold tracking-wide text-premium uppercase",
          className,
        )}
      >
        <SparklesIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        Premium
        {/* Sichtbar steht "Premium", vorgelesen wird "Premium-Unterstützer" —
            dasselbe Substantiv wie in der kompakten Variante. Ohne den
            Nachsatz hiesse es im Linknamen nur "Anna Premium". */}
        <span className="sr-only">-Unterstützer</span>
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label="Premium-Unterstützer"
      className={cn("ml-1 inline-flex shrink-0 items-center text-premium", className)}
    >
      {/* Der Tooltip hängt an einem <span>, nicht am <svg>: das
          title-Attribut ist global für HTML, in SVG 2 aber nicht, und
          Browser zeigen es dort nicht verlässlich an. */}
      <span title={TOOLTIP} aria-hidden="true" className="inline-flex">
        <SparklesIcon className="h-[clamp(11px,0.95em,15px)] w-[clamp(11px,0.95em,15px)]" />
      </span>
    </span>
  );
}

// Eine Zeichenkette, zwei Varianten: was der Zeiger anzeigt, soll nicht davon
// abhängen, auf welcher Seite man gerade ist.
const TOOLTIP = "Unterstützt Strado mit Premium";
