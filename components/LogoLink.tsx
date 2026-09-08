"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import Wortmarke from "@/components/Wortmarke";
import { cn } from "@/lib/utils/cn";

// Ereignis, mit dem das Logo auf der Startseite eine zufällige Strecke
// vorschlägt (siehe ExploreView.tsx). Bewusst ein CustomEvent auf window
// statt eines Kontexts: Header und ExploreView sind Geschwister in
// unterschiedlichen Teilbäumen, und der Header ist eine Server Component,
// die keinen Provider aufspannen kann.
export const ZUFALLSSTRECKE_EVENT = "strado:zufallsstrecke";

// Muss zur Dauer von @keyframes marke-anschlag in globals.css passen —
// länger wäre ein hängender Zustand, kürzer ein abgeschnittener.
const ANSCHLAG_MS = 400;

function bevorzugtReduzierteBewegung() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Die Wortmarke als Link auf die Startseite — mit zwei Zutaten, die der
 * blosse <Link><Wortmarke/></Link> im Header nicht haben kann.
 *
 * Erstens die Antipp-Animation: ausgelöst über pointerdown und einen
 * State, nicht über :hover oder :active. Auf Touch-Geräten gibt es keinen
 * Hover, und das globale -webkit-tap-highlight-color: transparent
 * (globals.css) nimmt dort jedes eingebaute Antipp-Feedback weg — ohne
 * eigenen Zustand fände auf einem iPad also gar nichts statt.
 *
 * Zweitens: steht man bereits auf "/", führt ein Klick nirgendwohin. Statt
 * einer Navigation ohne Wirkung schlägt das Logo dort eine zufällige
 * Strecke vor (ExploreView.tsx hört auf das Ereignis).
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
    // Der globale prefers-reduced-motion-Block in globals.css würde die
    // Animation ohnehin auf 0.01 ms kürzen; hier zusätzlich gar nicht erst
    // die Klasse zu setzen spart das Rendern und hält den DOM ruhig.
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
    // Klassen und aria-label unverändert aus Header.tsx übernommen:
    // text-foreground fixiert die Farbe, damit die Marke keine Hover-Farbe
    // der Leiste erbt, h-[18px] entspricht der früheren Texthöhe.
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
