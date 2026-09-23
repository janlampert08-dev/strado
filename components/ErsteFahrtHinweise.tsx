"use client";

import { TelefonIcon } from "@/components/NavIcons";
import { fahrHinweise, standortAnleitung, type Geraet } from "@/lib/geraet";
import type { StandortFreigabe } from "@/components/useStandortFreigabe";

/**
 * Was vor dem Start einer Aufzeichnung stehen muss — in drei Stufen:
 *
 * - Standort gesperrt: nichts anderes zählt. Statt "Bitte in den
 *   Einstellungen erlauben" steht da, wo auf diesem Gerät.
 * - Erste Fahrt auf diesem Gerät: die drei Punkte, die eine Fahrt retten
 *   (Standort, Bildschirm, Halterung), je ein fetter Anlauf und ein Satz.
 * - Danach: die eine Zeile, die vorher schon hier stand.
 *
 * Keine Karte und kein Kasten: das Panel darunter trägt den Startknopf, und
 * jede weitere Fläche drückt ihn tiefer.
 */
export default function ErsteFahrtHinweise({
  freigabe,
  geraet,
  gesehen,
}: {
  freigabe: StandortFreigabe;
  geraet: Geraet | null;
  gesehen: boolean;
}) {
  if (freigabe === "denied") {
    return (
      <div role="alert" className="flex flex-col gap-1 text-sm">
        <p className="font-medium text-danger">Der Standort ist für Strado gesperrt.</p>
        <p className="text-muted">
          {geraet
            ? standortAnleitung(geraet)
            : "Gib ihn in den Browser-Einstellungen für diese Seite frei und lade sie neu."}
        </p>
      </div>
    );
  }

  const iphone = geraet?.plattform === "ios";

  if (gesehen || !geraet) {
    return (
      <p className="flex items-start gap-2 text-sm leading-snug">
        <TelefonIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <span>
          {iphone
            ? "Bildschirm an lassen — auf dem iPhone stoppt die Aufzeichnung sonst."
            : "Bildschirm an lassen — sonst pausiert die Aufzeichnung."}
        </span>
      </p>
    );
  }

  // Ist der Standort schon frei, muss niemand darauf vorbereitet werden,
  // dass gleich danach gefragt wird.
  const hinweise = fahrHinweise(geraet).filter(
    (h) => !(h.id === "standort" && freigabe === "granted"),
  );

  return (
    <section aria-labelledby="erste-fahrt-titel" className="flex flex-col gap-2">
      <h2 id="erste-fahrt-titel" className="text-sm font-semibold">
        Vor der ersten Fahrt
      </h2>
      <ul className="flex flex-col gap-1.5">
        {hinweise.map((hinweis) => (
          <li key={hinweis.id} className="text-sm leading-snug text-muted">
            <span className="font-medium text-foreground">{hinweis.titel}.</span> {hinweis.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
