"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import Button, { type ButtonVariant } from "./Button";
import { SchliessenIcon } from "@/components/NavIcons";
import { cn } from "@/lib/utils/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /**
   * Zugänglicher Name für das Dialog-Element selbst, falls kein sichtbares
   * `title` gesetzt ist (z. B. eine Foto-Lightbox, wo eine Überschrift das
   * Layout sprengen würde). Wird ignoriert, sobald `title` vorhanden ist.
   */
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
}

// Natives <dialog> statt einer eigenen Modal-Implementierung oder
// Bibliothek — Fokus-Trap und "inert" für den Hintergrund kommen dadurch
// kostenlos vom Browser (Baseline-unterstützt), siehe Plan §3.
export function Dialog({ open, onClose, title, ariaLabel, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titelId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // showModal() lässt den Browser sonst selbst entscheiden, was den
      // Fokus bekommt (erstes fokussierbares Kind, sonst der Dialog
      // selbst) — mit focusVisible=false laut Spec, was Safari für
      // programmatischen Fokus aber nicht zuverlässig respektiert (zeigt
      // dort denselben Ring wie bei echter Tastaturnavigation) und dabei
      // zusätzlich versucht, das fokussierte Element in den sichtbaren
      // Bereich zu scrollen — kollidiert auf iOS mit der eigenen
      // Fixed-Positionierung des Dialogs (native <dialog:modal>) und kann
      // mitten im Scroll zu sichtbar zerrissenem Rendering führen. Fokus
      // stattdessen bewusst selbst auf den Dialog lenken (outline-none
      // unten) statt dem Default-Ziel des Browsers zu überlassen;
      // preventScroll unterbindet das ungewollte Scrollen dabei.
      el.focus({ preventScroll: true });
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={!title ? ariaLabel : undefined}
      // Mit Überschrift: die Überschrift IST der Name. Ohne aria-labelledby
      // trug der Dialog gar keinen — die Follower-Liste meldete sich beim
      // Öffnen nur als "Dialog", obwohl "Follower" darin steht.
      aria-labelledby={title ? titelId : undefined}
      className={cn(
        // dialog-animiert: Ein- und Ausblenden über @starting-style (globals.css);
        // der Hintergrund-Schleier kommt von dort, nicht mehr von backdrop:bg-black/60.
        "dialog-animiert m-auto w-[min(28rem,calc(100vw-2rem))] overscroll-y-contain rounded-lg border border-border bg-background p-5 text-foreground shadow-elevated outline-none",
        // UNTER sm EIN BLATT VON UNTEN, sobald der Dialog eine Überschrift
        // hat — Rückfragen, Listen, Formulare. Mittig schwebend lagen ihre
        // Knöpfe in der oberen Bildschirmhälfte, also dort, wo der Daumen
        // am schlechtesten hinkommt; von unten stehen sie, wo er ohnehin
        // ist. Die Foto-Lightbox (kein title) bleibt mittig: ein Bild ist
        // kein Blatt.
        title &&
          "dialog-blatt max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.25rem+var(--safe-bottom))]",
        className,
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      {/* Ein sichtbarer Schliessen-Knopf. Vorher schloss ein Dialog nur
          über Esc oder einen Tipp daneben — beides unsichtbar, und auf dem
          Telefon gibt es kein Esc. Die Follower-Liste hatte gar keinen
          anderen Ausweg. */}
      {title && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titelId} className="pt-2 text-title font-semibold">
            {title}
          </h2>
          {/* Ohne Rahmen, anders als ui/IconButton: im Kopf eines Blatts
              ist der Knopf Ausstattung, keine Handlung neben anderen — und
              cn ist kein tailwind-merge, ein angehängtes border-transparent
              setzte sich gegen den eingebauten Rahmen nicht verlässlich
              durch. 44 px Tippfläche bleiben. */}
          <button
            type="button"
            aria-label="Schliessen"
            onClick={() => ref.current?.close()}
            className="-mt-1 -mr-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-fast hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <SchliessenIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
      {children}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" für zerstörende Aktionen (Löschen), sonst neutrale Bestätigung. */
  variant?: Extract<ButtonVariant, "danger" | "primary">;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  variant = "primary",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      {description && <p className="mb-4 text-sm text-muted">{description}</p>}
      {/* Auf dem Telefon, wo die Rückfrage als Blatt von unten kommt, stehen
          die beiden Knöpfe untereinander in voller Breite und 44 px hoch —
          die bestätigende Handlung zuunterst, dort, wo der Daumen ist. Ab sm
          wie bisher nebeneinander rechts. Vorher waren es 36-px-Knöpfe
          ("sm") auch auf dem Telefon, ausgerechnet vor "Verwerfen" und
          "Löschen".

          flex-col und nicht flex-col-reverse: column-reverse setzt das erste
          Kind nach UNTEN, und das erste Kind ist hier der Abbrechen-Knopf —
          damit stand genau verkehrt herum, was der Absatz oben beschreibt.
          Dazu lief die Tab-Reihenfolge der sichtbaren entgegen (WCAG 2.4.3),
          weil die DOM-Folge Abbrechen/Bestätigen blieb. Ab sm ordnet
          flex-row ohnehin neu: Abbrechen links, Bestätigen rechts. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} className="max-sm:w-full">
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={variant}
          onClick={onConfirm}
          disabled={pending}
          className="max-sm:w-full"
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export default Dialog;
