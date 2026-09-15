"use client";

import {
  useState,
  type InputHTMLAttributes,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Gemeinsame Feld-Klassen — auch direkt verwendbar für native Elemente ohne
// eigenen Wrapper (z. B. <select>), statt für jede Variante eine eigene
// Komponente zu bauen.
export function fieldClassName(className?: string, invalid?: boolean): string {
  return cn(
    "w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition-shadow duration-fast",
    invalid
      ? "border-danger focus:border-danger focus:ring-2 focus:ring-danger/15"
      : "border-border focus:border-accent focus:ring-2 focus:ring-accent/15",
    className,
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  // Seit React 19 ist ref eine gewöhnliche Prop einer Funktionskomponente und
  // reist mit dem Spread unten ans <input>. Deklariert, damit ein Aufrufer den
  // Fokus setzen kann (NutzerWahl.tsx) — ohne forwardRef, das es dafür nicht
  // mehr braucht.
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, invalid, type, ...props }: InputProps) {
  // Passwortfelder bekommen automatisch einen Anzeigen/Verbergen-Umschalter,
  // statt ihn in jedem Formular einzeln nachzubauen — Umschalten ändert nur
  // den `type` des <input>, der Wert selbst bleibt unangetastet.
  const [visible, setVisible] = useState(false);

  if (type !== "password") {
    return (
      <input
        type={type}
        className={fieldClassName(className, invalid)}
        {...props}
      />
    );
  }

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        className={fieldClassName(cn("pr-10", className), invalid)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted transition-colors duration-fast hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return <textarea className={fieldClassName(className, invalid)} {...props} />;
}

export default Input;
