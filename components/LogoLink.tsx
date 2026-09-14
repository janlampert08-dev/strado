"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Wortmarke, { Signet } from "@/components/Wortmarke";
import { cn } from "@/lib/utils/cn";

// Ereignis, mit dem das Logo auf der Startseite eine zufällige Strecke
// vorschlägt (siehe ExploreView.tsx). Bewusst ein CustomEvent auf window
// statt eines Kontexts: Header und ExploreView sind Geschwister in
// unterschiedlichen Teilbäumen, und der Header ist eine Server Component,
// die keinen Provider aufspannen kann.
export const ZUFALLSSTRECKE_EVENT = "strado:zufallsstrecke";

// Müssen zu den Dauern der gleichnamigen @keyframes in globals.css passen —
// länger wäre ein hängender Zustand, kürzer ein abgeschnittener. Sichtbar
// ist immer nur eine der beiden Marken (Signet unter sm, Wortmarke ab sm),
// abgeräumt werden beide Klassen gemeinsam, also nach der längeren Dauer.
const ANSCHLAG_MS = 400;
const RUNDE_MS = 500;
const BEWEGUNG_MS = Math.max(ANSCHLAG_MS, RUNDE_MS);

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
    timeoutRef.current = setTimeout(() => setAnschlag(false), BEWEGUNG_MS);
  }

  function vorschlagen() {
    window.dispatchEvent(new CustomEvent(ZUFALLSSTRECKE_EVENT));
  }

  // Zwei Marken, eine davon sichtbar: unter sm nur das Signet (lib/marke.ts,
  // der Rundkurs), ab sm der ganze Schriftzug. Bewusst über CSS statt über
  // eine Breitenmessung in JavaScript — ein useEffect mit matchMedia
  // zeichnete beim ersten Bild zwangsläufig die falsche Marke und tauschte
  // sie danach sichtbar aus.
  //
  // h-[18px] auf beiden: die Wortmarke entspricht damit der früheren
  // Texthöhe, das Signet steht mit gleicher Höhe daneben und holt seine
  // Breite über w-auto aus dem viewBox (es ist ≈ 1.7-mal so breit wie hoch,
  // eine quadratische Klasse würde es stauchen). text-foreground fixiert die
  // Farbe an der Leiste, damit keine Hover-Farbe durchschlägt.
  //
  // Antipp-Quittung je Marke: die Wortmarke neigt sich (marke-anschlag), das
  // Signet dreht eine Runde (signet-runde). Beide Klassen hängen am selben
  // Zustand — die unsichtbare Marke animiert dann mit, was nichts kostet und
  // den Zustand einfach hält.
  const marke = (
    <>
      <Signet
        className={cn("h-[18px] w-auto sm:hidden", anschlag && "signet-runde")}
      />
      <Wortmarke
        className={cn("hidden h-[18px] w-auto sm:block", anschlag && "marke-anschlag")}
      />
    </>
  );
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
