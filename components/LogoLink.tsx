"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

/**
 * Determines whether the user prefers reduced motion.
 *
 * @returns `true` if reduced motion is preferred, `false` otherwise.
 */
function bevorzugtReduzierteBewegung() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Renders the wordmark as a homepage link or a random-route action on the homepage.
 *
 * The wordmark provides tap feedback unless reduced motion is preferred.
 */
export default function LogoLink() {
  const pathname = usePathname();
  const istStartseite = pathname === "/";
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

  /**
   * Requests a random route suggestion by dispatching the corresponding window event.
   */
  function vorschlagen() {
    window.dispatchEvent(new CustomEvent(ZUFALLSSTRECKE_EVENT));
  }

  // Klassen unverändert aus Header.tsx übernommen: text-foreground fixiert
  // die Farbe, damit die Marke keine Hover-Farbe der Leiste erbt, h-[18px]
  // entspricht der früheren Texthöhe.
  const marke = <Wortmarke className={cn("h-[18px] w-auto", anschlag && "marke-anschlag")} />;
  // cursor-pointer nur auf dem Button-Zweig: es ist dieselbe Marke wie auf
  // jeder anderen Seite, und dort ist sie ein Link. Ohne die Klasse bekäme
  // sie ausgerechnet auf der Startseite den Standard-Cursor eines Buttons
  // und fühlte sich anders an als zwei Klicks vorher.
  const klassen = "shrink-0 text-foreground";

  // Auf der Startseite ist das hier kein Link: es führt nirgendwohin,
  // sondern schlägt eine Strecke vor. Als <Link> angekündigt bekämen
  // Screenreader-Nutzende "Strado, zur Startseite" zu hören und danach eine
  // Seite, die sich nicht bewegt hat. Deshalb dort ein echter Button mit
  // dem Namen der Handlung, die er auslöst — und überall sonst weiterhin
  // der Link nach Hause.
  if (istStartseite) {
    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onClick={vorschlagen}
        className={cn(klassen, "cursor-pointer")}
        aria-label="Zufällige Strecke vorschlagen"
      >
        {marke}
      </button>
    );
  }

  return (
    <Link
      href="/"
      onPointerDown={handlePointerDown}
      className={klassen}
      aria-label="Strado, zur Startseite"
    >
      {marke}
    </Link>
  );
}
