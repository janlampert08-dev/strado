"use client";

import { useEffect } from "react";

/**
 * Welche Formulare gerade ungespeicherte Eingaben halten. Ein Modul-Set statt
 * eines Contexts: gelesen wird es nur von components/BackButton.tsx im Kopf,
 * der in einem ganz anderen Teilbaum hängt als die Formulare, und eine
 * Zahl in einem Set braucht kein Rendern.
 */
const offeneEntwuerfe = new Set<string>();

/** Für BackButton: liegt irgendwo ein ungespeicherter Entwurf? */
export function hatOffenenEntwurf(): boolean {
  return offeneEntwuerfe.size > 0;
}

/**
 * Schützt einen Entwurf vor dem stillen Verlust.
 *
 * Vorher verschwand eine halb gebaute Strecke (Wegpunkte, Name, Tags) oder
 * ein halb ausgefülltes Fahrzeug beim Tipp auf "Zurück" wortlos. Zwei Wege
 * sind jetzt abgedeckt:
 *
 * - Neuladen, Tab schliessen, fremde Adresse: `beforeunload`, die Rückfrage
 *   des Browsers selbst.
 * - Der Zurück-Knopf im Kopf: fragt über hatOffenenEntwurf() in-App nach.
 *
 * Nicht abgedeckt ist eine Client-Navigation über die Leiste unten. Der App
 * Router bietet keinen Weg, sie anzuhalten, und ein Nachbau über
 * abgefangene Klicks wäre zerbrechlicher als die Lücke. So benannt statt
 * verschwiegen.
 */
export function useEntwurfSchutz(schluessel: string, aktiv: boolean): void {
  useEffect(() => {
    if (!aktiv) return;
    offeneEntwuerfe.add(schluessel);
    function warnen(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnen);
    return () => {
      offeneEntwuerfe.delete(schluessel);
      window.removeEventListener("beforeunload", warnen);
    };
  }, [schluessel, aktiv]);
}
