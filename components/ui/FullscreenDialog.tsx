"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

// Vollflächige Schritte des Aufzeichnungs-Flows (FreeRideForm,
// LiveTrackingForm). Sie liegen als "fixed inset-0 z-50" mit deckendem
// Hintergrund über der Seite und verdecken Header und BottomNav
// vollständig — für Auge und Maus ist das ein modaler Dialog.
//
// "Über der Seite" gilt nur, solange kein Vorfahre einen eigenen
// Stapelkontext aufspannt: Auf der Streckenseite hängt die Aufzeichnung im
// Bottom-Sheet (DragSheet, positioniert mit z-10), und darin gefangen
// konkurriert z-50 nur noch lokal — gegen die BottomNav (z-40 auf
// Körperebene) verliert der Dialog, und die Leiste malt über seine
// untersten rund 64 px samt Schaltflächen. Deshalb hängt der Dialog per
// Portal direkt an document.body statt im Sheet-Baum: Dort gilt z-50
// wieder gegen die ganze Seite, und die "inert"-Stilllegung unten trifft
// ohnehin die Geschwister bis hinauf zum Körper.
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
  // Erst nach dem Mount portiert: Auf dem Server gibt es kein document, und
  // der erste Client-Render muss dem Server-HTML entsprechen — also dort wie
  // hier nichts. Geöffnet werden diese Schritte ohnehin nur per Tipp, nie
  // beim ersten Aufbau (der ?fortsetzen-Einstieg der Streckenseite läuft
  // ebenfalls erst im Client).
  const [portiert, setPortiert] = useState(false);
  useEffect(() => {
    // Mount-Erkennung fürs Portal: document gibt es erst im Client, und der
    // erste Client-Render muss dem Server-HTML (nichts) entsprechen.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalige Mount-Erkennung, wie in GefahrenSection.tsx
    setPortiert(true);
  }, []);

  useEffect(() => {
    if (!portiert) return;
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
  }, [portiert]);

  if (!portiert) return null;

  return createPortal(
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
    </div>,
    document.body,
  );
}
