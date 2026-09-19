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

  function vorschlagen() {
    window.dispatchEvent(new CustomEvent(ZUFALLSSTRECKE_EVENT));
  }

  // Der ganze Schriftzug, auf jeder Bildschirmgrösse — auch auf dem
  // schmalsten Telefon. Zwischen dem 14. und 15. September 2026 stand hier
  // unter sm nur das Signet; das ist bewusst zurückgenommen worden. Der Name
  // ist das, was eine App bekannt macht, und die Kopfleiste ist die einzige
  // Fläche, auf der ihn jede Nutzerin bei jedem Seitenaufruf liest. Platz ist
  // nicht das Problem: 71 px Marke, ein Zurück-Pfeil und das Flammen-Icon
  // passen auch auf 320 px nebeneinander.
  //
  // Klassen wie gehabt: text-foreground (unten) fixiert die Farbe, damit die
  // Marke keine Hover-Farbe der Leiste erbt, h-[18px] entspricht der früheren
  // Texthöhe.
  const marke = <Wortmarke className={cn("h-[18px] w-auto", anschlag && "marke-anschlag")} />;
  // cursor-pointer nur auf dem Button-Zweig: es ist dieselbe Marke wie auf
  // jeder anderen Seite, und dort ist sie ein Link. Ohne die Klasse bekäme
  // sie ausgerechnet auf der Startseite den Standard-Cursor eines Buttons
  // und fühlte sich anders an als zwei Klicks vorher.
  //
  // relative + after: die Marke ist 18 px hoch, als Tippfläche zu klein.
  // Das Pseudoelement dehnt sie auf 44 px, ohne den Kopf zu vergrössern.
  const klassen =
    "relative shrink-0 text-foreground after:absolute after:-inset-x-2 after:-inset-y-[13px] after:content-['']";

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
