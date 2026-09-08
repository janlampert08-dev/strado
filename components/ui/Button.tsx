import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 font-medium transition-[transform,opacity,border-color,background-color] duration-fast ease-standard active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const variants: Record<ButtonVariant, string> = {
  primary:
    "rounded-full border border-foreground bg-foreground text-background hover:opacity-90",
  accent: "rounded-full border border-accent bg-accent text-background hover:opacity-90",
  secondary:
    "rounded-lg border border-border text-foreground hover:border-border-strong",
  ghost: "rounded-lg text-foreground hover:bg-surface",
  danger: "rounded-full border border-danger bg-danger text-background hover:opacity-90",
};

// Die min-h-Werte sind der eigentliche Punkt dieser Tabelle, nicht die
// Schriftgrösse. Aus px-4 py-2 text-sm ergaben sich rund 36 px Höhe, aus
// px-3 py-1.5 text-xs rund 28 px. Beide liegen über der 24-px-Untergrenze
// von WCAG 2.2 SC 2.5.8 (AA) — ein Verstoss war das also nicht —, aber
// deutlich unter den 44 px, die Apple und WCAG SC 2.5.5 (AAA) für einen
// Fingertipp ansetzen. Für eine App, die im Fahrzeug bedient wird, ist das
// die falsche Seite der Grenze.
//
// min-h statt mehr py: die Schrift bleibt, wo sie war, und ein Button mit
// kurzer Beschriftung wächst nicht in die Breite. Zusammen mit dem
// inline-flex + items-center aus `base` bleibt der Inhalt zentriert.
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
  // Nur für die Bedienelemente während einer laufenden Aufzeichnung
  // (LiveTrackingForm, FreeRideForm, "Strecke starten"). Dort wird mit
  // Handschuhen, in Bewegung und mit einem Blick von einer halben Sekunde
  // getippt; 52 px ist die Höhe, die die "Strecke starten"-Schaltfläche
  // schon vorher von Hand hatte.
  lg: "min-h-[3.25rem] px-6 py-3.5 text-base",
};

// Zentrale Klassen-Zusammensetzung, damit dieselben Varianten auch auf
// next/link (z. B. "Zur Übersicht") angewendet werden können, ohne den
// <Button> selbst als Link zu missbrauchen.
export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />;
}
