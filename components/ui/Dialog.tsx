"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Button, { type ButtonVariant } from "./Button";
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
  /**
   * Ob Escape und ein Klick auf den Hintergrund den Dialog schliessen
   * dürfen. Standard ist ja — abschalten nur dort, wo ein Schliessen
   * gerade etwas kaputt macht, das nicht rückgängig zu machen ist (z. B.
   * eine laufende Zahlung in PremiumCheckoutForm). Ein Dialog, aus dem es
   * dauerhaft keinen Weg heraus gibt, wäre schlimmer als das Problem:
   * wer das setzt, schuldet einen sichtbaren Ausgang, sobald der Grund
   * wegfällt.
   */
  dismissable?: boolean;
  children: ReactNode;
  className?: string;
}

// Natives <dialog> statt einer eigenen Modal-Implementierung oder
// Bibliothek — Fokus-Trap und "inert" für den Hintergrund kommen dadurch
// kostenlos vom Browser (Baseline-unterstützt), siehe Plan §3.
export function Dialog({
  open,
  onClose,
  title,
  ariaLabel,
  dismissable = true,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

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

  // Escape geht am nativen <dialog> nicht am Aufrufer vorbei, sondern über
  // ein abbrechbares "cancel"-Ereignis — preventDefault() hält den Dialog
  // offen. Das ist der einzige Weg, der auch den Browser-eigenen
  // Schliessbefehl erwischt; ein keydown-Handler käme zu spät.
  useEffect(() => {
    const el = ref.current;
    if (!el || dismissable) return;
    const abfangen = (event: Event) => event.preventDefault();
    el.addEventListener("cancel", abfangen);
    return () => el.removeEventListener("cancel", abfangen);
  }, [dismissable]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={!title ? ariaLabel : undefined}
      className={cn(
        "m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-5 text-foreground shadow-elevated outline-none backdrop:bg-foreground/30",
        className,
      )}
      onClick={(event) => {
        if (dismissable && event.target === event.currentTarget) ref.current?.close();
      }}
    >
      {title && <h2 className="mb-3 text-title font-semibold">{title}</h2>}
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={variant}
          size="sm"
          onClick={onConfirm}
          disabled={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export default Dialog;
