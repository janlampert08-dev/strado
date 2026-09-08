"use client";

import { useEffect, useRef, useState } from "react";
import { bewerteBewegungsprofil } from "@/lib/bewegungsprofil";
import type { TrailPoint } from "@/lib/geo";

// Wie bei useLiveLapHint bewusst grosszügig gedrosselt: die Prüfung dient nur
// der frühen Rückmeldung während der Fahrt und muss nicht bei jedem GPS-Fix
// laufen, schon gar nicht auf einem Handy im Akkubetrieb.
const PRUEF_INTERVALL_MS = 30_000;

// Früher Hinweis während einer laufenden Aufzeichnung: "das hier sieht nach
// Zug oder Flug aus". Der Text stammt aus derselben Funktion, die auch der
// Server befragt, damit die Aussage unterwegs und beim Speichern dieselbe
// ist — und er sagt bereits selbst, ob gespeichert werden kann (Flug: nein;
// Bahn: doch, mit Bitte um Ehrlichkeit).
//
// Der Sinn ist die Frühwarnung: wer erst im Fazit erfährt, dass eine
// Flugaufzeichnung nicht speicherbar ist, hat sie umsonst gemacht.
/** Was die Warnung sagt, und ob sie das Speichern am Ende verhindert. Ohne
 *  das Zweite läse sich ein Bahn-Hinweis wie eine Ablehnung — er ist aber
 *  nur eine Nachfrage (siehe lib/bewegungsprofil.ts). */
export interface Bewegungswarnung {
  text: string;
  blockiert: boolean;
}

export function useBewegungswarnung(
  active: boolean,
  liveTrailPoints: TrailPoint[],
): Bewegungswarnung | null {
  const [warnung, setWarnung] = useState<Bewegungswarnung | null>(null);
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
      if (profil.begruendung) {
        setWarnung({ text: profil.begruendung, blockiert: profil.blockiert });
      }
    }, PRUEF_INTERVALL_MS);

    return () => clearInterval(interval);
  }, [active]);

  return warnung;
}
