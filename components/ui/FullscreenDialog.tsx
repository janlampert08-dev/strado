"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Vollflächige Schritte des Aufzeichnungs-Flows (FreeRideForm,
// LiveTrackingForm). Sie liegen als "fixed inset-0 z-50" mit deckendem
// Hintergrund über der Seite und verdecken Header und BottomNav
// vollständig — für Auge und Maus ist das ein modaler Dialog.
//
// Für die Tastatur war es das bisher nicht: verdeckt heisst nicht
// unerreichbar, die Navigation dahinter blieb per Tab ansteuerbar. Ein
// role="dialog" aria-modal="true" auf dem Container allein verspricht
// genau diese Eingrenzung, ohne sie herzustellen — Screenreader melden
// dann eine Modalität, die es nicht gibt.
//
// Umgesetzt über "inert" auf allen Geschwisterknoten bis hinauf zum
// <body> statt über eine eigene Tab-Falle. Der Browser nimmt die
// betroffenen Teilbäume damit komplett aus Fokusreihenfolge und
// Barrierefreiheits-Baum; es gibt keine Tastenbehandlung, die
// danebengreifen und den Nutzer einsperren könnte. "inert" ist
// Baseline-unterstützt — dieselbe Grundlage, auf der components/ui/Dialog
// das native <dialog> nutzt.
//
// Warum nicht gleich <dialog> mit showModal(): dessen Top-Layer bringt
// eigene Positionierung und Scroll-Verhalten mit, mit denen die Karte und
// die safe-area-Ränder dieser Schritte auf iOS kollidieren. Das ist der
// Grund, aus dem diese Schritte überhaupt eigene Overlays sind.
export default function FullscreenDialog({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const zuvorFokussiert = document.activeElement as HTMLElement | null;
    const stillgelegt: HTMLElement[] = [];

    // Von aussen nach innen: auf jeder Ebene alles inert setzen, was nicht
    // auf dem Pfad zu diesem Overlay liegt. Bereits inerte Knoten bleiben
    // unangetastet, damit ein verschachtelter Fall sie nicht beim Aufräumen
    // versehentlich wiederbelebt.
    let knoten: HTMLElement | null = el;
    while (knoten && knoten !== document.body) {
      const eltern: HTMLElement | null = knoten.parentElement;
      if (!eltern) break;
      for (const geschwister of Array.from(eltern.children)) {
        if (geschwister !== knoten && geschwister instanceof HTMLElement && !geschwister.inert) {
          geschwister.inert = true;
          stillgelegt.push(geschwister);
        }
      }
      knoten = eltern;
    }

    // Der Fokus muss aktiv hereingeholt werden: er steht sonst weiterhin auf
    // dem Element, von dem aus der Schritt ausgelöst wurde — und das ist
    // gerade inert geworden. Ziel ist der Container selbst, nicht das erste
    // Bedienelement: so liest ein Screenreader zuerst den Namen des Schritts
    // vor, statt mitten in einem Knopf zu landen.
    el.focus({ preventScroll: true });

    return () => {
      for (const geschwister of stillgelegt) geschwister.inert = false;
      // Nur zurückgeben, wenn es das Element noch gibt — beim Wechsel von
      // einem Schritt zum nächsten ist der Auslöser längst ausgehängt.
      if (zuvorFokussiert?.isConnected) zuvorFokussiert.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      ref={ref}
      // tabIndex={-1} macht den Container programmatisch fokussierbar, ohne
      // ihn in die Tab-Reihenfolge zu hängen; outline-none unterdrückt den
      // Ring, den dieser Fokus sonst um den ganzen Bildschirm zöge.
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cn("outline-none", className)}
    >
      {children}
    </div>
  );
}
