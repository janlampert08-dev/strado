"use client";

import { useFormStatus } from "react-dom";
import { buttonVariants, type ButtonVariant } from "@/components/ui/Button";

// Submit-Button für Formulare, die eine Server Action DIREKT über
// <form action={…}> binden — also ohne useActionState, das sonst überall
// in dieser App den Pending-Zustand liefert.
//
// useFormStatus muss dafür in einer eigenen Komponente INNERHALB des
// Formulars sitzen: Der Hook liest den Status des umschliessenden <form>
// und liefert im selben Komponentenbaum, in dem das Formular deklariert
// wird, immer pending = false.
//
// Ohne das bleibt ein solcher Button während der laufenden Action
// unverändert bedienbar. Beim Abo-Portal (components/PremiumCard.tsx)
// heisst ein zweiter Klick: eine zweite Stripe-Portal-Sitzung.
export default function SubmitButton({
  children,
  pendingLabel,
  variant = "secondary",
  className,
}: {
  children: React.ReactNode;
  // Sichtbarer Text während der Ausführung. Ohne Angabe bleibt die
  // Beschriftung stehen und nur der Disabled-Zustand zeigt an, dass etwas
  // passiert — für kurze Aktionen genug, für Weiterleitungen zu Stripe
  // nicht.
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      // aria-disabled zusätzlich zu disabled: Manche Screenreader
      // überspringen ein disabled-Element beim Navigieren ganz, der Nutzer
      // verlöre also die Rückmeldung, warum nichts passiert.
      aria-disabled={pending}
      className={buttonVariants({ variant, size: "sm", className })}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
