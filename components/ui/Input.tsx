"use client";

import {
  useState,
  type InputHTMLAttributes,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { Eye, EyeOff } from "@/components/NavIcons";
import { cn } from "@/lib/utils/cn";

// Gemeinsame Feld-Klassen — auch direkt verwendbar für native Elemente ohne
// eigenen Wrapper (z. B. <select>), statt für jede Variante eine eigene
// Komponente zu bauen.
// text-base unter md, text-sm ab md: Safari auf iOS zoomt beim Fokussieren
// automatisch in ein Eingabefeld hinein, sobald dessen Schrift kleiner als
// 16px ist — und zoomt danach nicht von selbst wieder heraus. Die Nutzerin
// bleibt also mit einer vergrösserten, seitlich verschobenen Seite zurück,
// und zwar ab dem ersten Tippen in ein Feld. Das traf hier jedes Feld der
// App: text-sm sind 14px, und diese eine Funktion kleidet zwölf Dateien ein.
//
// Getroffen hat es damit die Anmeldung, die Registrierung, das Zurücksetzen
// des Passworts und die Streckensuche — also genau den Weg, den ein neuer
// Besucher zuerst geht.
//
// 14px nur ab md UND mit Maus/Trackpad (pointer: fine). Die Breite allein
// reichte nicht: ein iPad ist 768 px und mehr breit, fällt also unter md,
// und Safari zoomt dort genauso in jedes Feld unter 16px wie auf dem
// Telefon. Ein iPad mit Trackpad meldet pointer: fine und bekommt die
// kompakte Schrift; ohne Trackpad bleibt es bei 16px. Gefunden vom
// E2E-Test "Eingabefelder haben mindestens 16 px Schrift" (e2e/).
export function fieldClassName(className?: string, invalid?: boolean): string {
  return cn(
    // min-h-11: mit py-2 und text-base waren Felder 42 px hoch, knapp unter
    // der 44-px-Tippfläche, die der Rest der App einhält.
    "min-h-11 w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none transition-shadow duration-fast md:pointer-fine:text-sm",
    invalid
      ? "border-danger focus:border-danger focus:ring-2 focus:ring-danger/15"
      // Akzentrand plus 1 px Ring = eine 2 px starke Akzentkante (5.9:1).
      // Vorher ein 15-%-Schimmer, schwächer als jeder andere Fokus der App.
      : "border-border-control focus:border-accent focus:ring-1 focus:ring-accent",
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
        className={fieldClassName(cn("pr-12", className), invalid)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        // min-w-11 statt px-3: der Knopf war 40 px breit und damit das eine
        // Ziel im Anmeldeformular unter der 44-px-Marke — bei einem Knopf,
        // den man mit nassen Fingern am Strassenrand trifft oder nicht. Das
        // Feld bekommt dafür pr-12, damit der Text nicht darunter läuft.
        className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center text-muted transition-colors duration-fast hover:text-foreground"
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
