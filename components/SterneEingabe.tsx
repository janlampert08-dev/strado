"use client";

import { useState } from "react";
import { SternIcon } from "@/components/NavIcons";
import { cn } from "@/lib/utils/cn";

const SKALA = [1, 2, 3, 4, 5] as const;

/**
 * Die Sternwahl im Bewertungsformular.
 *
 * ---------------------------------------------------------------------------
 * Warum echte Radios und keine Schaltflächen
 * ---------------------------------------------------------------------------
 * Fünf `<input type="radio">` mit demselben `name` sind bereits eine
 * Radiogruppe: die Pfeiltasten wechseln darin, Tab springt in die Gruppe und
 * wieder heraus, und der Wert landet ohne Zutun im FormData. Fünf
 * `<button>`-Elemente plus ein verstecktes Feld müssten all das nachbauen —
 * und hätten es, nach aller Erfahrung, für die Tastatur nicht getan.
 *
 * Sichtbar sind die Radios nicht: `sr-only` nimmt sie aus dem Bild, ohne sie
 * aus dem Fokus-Fluss zu nehmen (`display: none` täte beides). Gezeichnet
 * wird der Stern im `<label>` daneben, der den Klick ohnehin weiterreicht.
 * Der Fokusring hängt über `peer-focus-visible` am Stern, sonst läge er auf
 * einem unsichtbaren Element.
 *
 * ---------------------------------------------------------------------------
 * Kontrolliert, nicht unkontrolliert
 * ---------------------------------------------------------------------------
 * Anders als die übrigen Felder der App hält diese Komponente ihren Wert in
 * React-State. Grund ist die Vorschau beim Überfahren: welcher Stern gefüllt
 * gezeichnet wird, hängt nicht nur von der Wahl ab, sondern auch davon, wo
 * der Zeiger gerade steht — das muss ohnehin durch einen Render. Den Wert
 * dann zusätzlich im DOM zu führen hiesse, zwei Quellen zu haben.
 *
 * components/useEingabenBewahren.ts stellt nach einem fehlgeschlagenen
 * Absenden zusätzlich das `checked` im DOM wieder her. Beide Wege landen auf
 * demselben Wert, sie widersprechen sich also nicht.
 *
 * ---------------------------------------------------------------------------
 * Zurücknehmen
 * ---------------------------------------------------------------------------
 * Eine einmal gesetzte Wahl lässt sich wieder auf "keine Wertung" stellen —
 * die Schaltfläche dafür erscheint erst, wenn es etwas zurückzunehmen gibt.
 * Ohne sie wäre eine versehentlich vergebene Wertung nur noch durch Löschen
 * der ganzen Bewertung loszuwerden, und das nähme den Kommentar mit.
 */
export default function SterneEingabe({
  name = "sterne",
  anfangswert,
}: {
  name?: string;
  /** Die gespeicherte eigene Wertung, oder null. */
  anfangswert: number | null;
}) {
  const [wert, setWert] = useState<number | null>(anfangswert);
  const [vorschau, setVorschau] = useState<number | null>(null);

  // Beim Überfahren zeigt die Vorschau, was ein Klick ergäbe; sonst die Wahl.
  const gezeigt = vorschau ?? wert ?? 0;

  return (
    <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <legend className="sr-only">Wertung von 1 bis 5 Sternen</legend>

      <span className="flex items-center" onMouseLeave={() => setVorschau(null)}>
        {SKALA.map((stufe) => (
          <label
            key={stufe}
            onMouseEnter={() => setVorschau(stufe)}
            className="cursor-pointer p-0.5"
          >
            <input
              type="radio"
              name={name}
              value={stufe}
              checked={wert === stufe}
              onChange={() => setWert(stufe)}
              className="peer sr-only"
            />
            <span className="sr-only">
              {stufe} {stufe === 1 ? "Stern" : "Sterne"}
            </span>
            <SternIcon
              aria-hidden="true"
              className={cn(
                "h-6 w-6 rounded-sm transition-colors duration-fast",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40",
                stufe <= gezeigt ? "fill-current text-accent" : "text-border-strong",
              )}
            />
          </label>
        ))}
      </span>

      {wert !== null && (
        <button
          type="button"
          onClick={() => {
            setWert(null);
            setVorschau(null);
          }}
          className="text-xs text-muted transition-colors duration-fast hover:text-foreground"
        >
          Wertung entfernen
        </button>
      )}
    </fieldset>
  );
}
