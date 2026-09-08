"use client";

import { useEffect, useRef, useState } from "react";
import { bewerteBewegungsprofil } from "@/lib/bewegungsprofil";
import type { TrailPoint } from "@/lib/geo";

// Wie bei useLiveLapHint bewusst grosszügig gedrosselt: die Prüfung dient nur
// der frühen Rückmeldung während der Fahrt und muss nicht bei jedem GPS-Fix
// laufen, schon gar nicht auf einem Handy im Akkubetrieb.
const PRUEF_INTERVALL_MS = 30_000;

// Früher Hinweis während einer laufenden Aufzeichnung: "das hier sieht nach
// Zug/Flug aus und lässt sich am Ende nicht speichern". Reiner Komfort — die
// Kontrolle sitzt serverseitig in lib/actions/completions.ts, die hier
// gezeigte Begründung stammt aber aus derselben Funktion, damit die Aussage
// unterwegs und beim Speichern dieselbe ist.
//
// Der Sinn ist genau diese Frühwarnung: wer erst im Fazit erfährt, dass
// nichts gespeichert werden kann, hat die Fahrt umsonst aufgezeichnet.
export function useBewegungswarnung(
  active: boolean,
  liveTrailPoints: TrailPoint[],
): string | null {
  const [warnung, setWarnung] = useState<string | null>(null);
  const trailRef = useRef(liveTrailPoints);

  useEffect(() => {
    trailRef.current = liveTrailPoints;
  }, [liveTrailPoints]);

  useEffect(() => {
    if (!active) {
      // setState in einem Timeout statt direkt im Effekt-Body — gleiches
      // Muster wie in useLiveLapHint (react-hooks/set-state-in-effect).
      const resetId = setTimeout(() => setWarnung(null), 0);
      return () => clearTimeout(resetId);
    }

    const interval = setInterval(() => {
      const profil = bewerteBewegungsprofil(trailRef.current);
      // Einmal gezeigt, bleibt der Hinweis stehen: der Trail wächst weiter,
      // und ein Hinweis, der zwischendurch verschwindet, wirkt wie ein
      // Fehler statt wie eine Warnung.
      if (!profil.plausibel && profil.begruendung) setWarnung(profil.begruendung);
    }, PRUEF_INTERVALL_MS);

    return () => clearInterval(interval);
  }, [active]);

  return warnung;
}
