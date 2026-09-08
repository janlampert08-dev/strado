"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import Wortmarke from "@/components/Wortmarke";
import { cn } from "@/lib/utils/cn";

// Ereignis, mit dem das Logo auf der Startseite eine zufaellige Strecke
// vorschlaegt (siehe ExploreView.tsx). Bewusst ein CustomEvent auf window
// statt eines Kontexts: Header und ExploreView sind Geschwister in
// unterschiedlichen Teilbaeumen, und der Header ist eine Server Component,
// die keinen Provider aufspannen kann.
export const ZUFALLSSTRECKE_EVENT = "strado:zufallsstrecke";

// Muss zur Dauer von @keyframes marke-anschlag in globals.css passen —
// laenger waere ein haengender Zustand, kuerzer ein abgeschnittener.
const ANSCHLAG_MS = 400;

function bevorzugtReduzierteBewegung() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Die Wortmarke als Link auf die Startseite — mit zwei Zutaten, die der
 * blosse <Link><Wortmarke/></Link> im Header nicht haben kann.
 *
 * Erstens die Antipp-Animation: ausgeloest ueber pointerdown und einen
 * State, nicht ueber :hover oder :active. Auf Touch-Geraeten gibt es keinen
 * Hover, und das globale -webkit-tap-highlight-color: transparent
 * (globals.css) nimmt dort jedes eingebaute Antipp-Feedback weg — ohne
 * eigenen Zustand faende auf einem iPad also gar nichts statt.
 *
 * Zweitens: steht man bereits auf "/", fuehrt ein Klick nirgendwohin. Statt
 * einer Navigation ohne Wirkung schlaegt das Logo dort eine zufaellige
 * Strecke vor (ExploreView.tsx hoert auf das Ereignis).
 */
export default function LogoLink() {
  const pathname = usePathname();
  const [anschlag, setAnschlag] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handlePointerDown() {
    // Der globale prefers-reduced-motion-Block in globals.css wuerde die
    // Animation ohnehin auf 0.01 ms kuerzen; hier zusaetzlich gar nicht erst
    // die Klasse zu setzen spart das Rendern und haelt den DOM ruhig.
    if (bevorzugtReduzierteBewegung()) return;
    setAnschlag(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setAnschlag(false), ANSCHLAG_MS);
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(ZUFALLSSTRECKE_EVENT));
  }

  return (
    // Klassen und aria-label unveraendert aus Header.tsx uebernommen:
    // text-foreground fixiert die Farbe, damit die Marke keine Hover-Farbe
    // der Leiste erbt, h-[18px] entspricht der frueheren Texthoehe.
    <Link
      href="/"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className="shrink-0 text-foreground"
      aria-label="Strado, zur Startseite"
    >
      <Wortmarke className={cn("h-[18px] w-auto", anschlag && "marke-anschlag")} />
    </Link>
  );
}
