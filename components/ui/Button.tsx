import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 font-medium transition-[transform,opacity,border-color,background-color] duration-fast ease-standard active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// Alle fünf tragen dieselbe Silhouette. Vorher waren primary/accent/danger
// Pillen und secondary/ghost Rechtecke — und im grid-cols-2 der Profilseite
// standen beide nebeneinander, gleich breit und gleich hoch: das liest sich
// nicht als Rangfolge, sondern als zwei Bausätze.
//
// Die Rangfolge trägt jetzt, was sie tragen soll: Fläche und Rahmen
// (gefüllt → Umriss → ohne Rahmen). Card, Eingabefelder und Dialoge behalten
// --radius-lg; damit wird "rund = Handlung, weich-eckig = Fläche" zur Regel
// statt zum Zufall. Die Chips (motorklassenChipStil.ts, der Standort-Chip,
// die Feed-Reiter) waren ohnehin schon Pillen.
//
// EINE FARBE FÜR DIE HAUPTHANDLUNG. "primary" war eine weiss (bzw. im
// hellen Theme schwarz) gefüllte Pille, "accent" eine blaue — und welche von
// beiden eine Seite als Haupthandlung trug, war Zufall: "Fahrt speichern",
// "Strecke starten" und "Folgen" blau, "Speichern" im Fahrzeugformular und
// "+ Strecke erstellen" weiss, "Zur Prüfung einreichen" im gesperrten
// Zustand hellgrau. Wer "was ist hier die Handlung?" beantworten will,
// musste es pro Schirm neu lernen. Jetzt trägt jede Haupthandlung den
// Akzent. Der Schlüssel "primary" bleibt, damit nicht jeder Aufrufer
// wandern muss; er ist nur kein zweiter Look mehr.
const variants: Record<ButtonVariant, string> = {
  primary: "rounded-full border border-accent bg-accent text-background hover:opacity-90",
  accent: "rounded-full border border-accent bg-accent text-background hover:opacity-90",
  secondary:
    "rounded-full border border-border-control text-foreground hover:border-border-strong",
  ghost: "rounded-full text-foreground hover:bg-surface",
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

/**
 * Die eigenständige Text-Handlung: ein Link oder Knopf, der wie Text
 * aussieht, aber allein steht statt in einem Satz.
 *
 * DIE UNTERSCHEIDUNG, und sie ist der Grund für diese Funktion:
 *
 *   "Hast du schon ein Konto? [Anmelden]"   — im Satz. Bleibt, wie er ist.
 *                                             44 px hoch zu machen risse
 *                                             den Absatz auseinander.
 *   "[+ Fahrzeug hinzufügen]"               — steht allein. Ist eine
 *                                             Schaltfläche, die nur nicht
 *                                             wie eine aussieht.
 *
 * Acht Stellen der App gehören in die zweite Gruppe und standen trotzdem
 * als blanker Text da: rund 20 px hoch bei text-sm, rund 16 px bei text-xs.
 * Die App schreibt für eine Tippfläche 44 px fest (components/ui/IconButton
 * begründet den Wert), und "+ Fahrzeug hinzufügen" steht ausgerechnet im
 * Fazit — also am Strassenrand, im Helm.
 *
 * Nur die Höhe kommt dazu, nicht die Optik: kein Rahmen, keine Füllung. Der
 * Unterschied zu buttonVariants bleibt, dass diese Handlung untergeordnet
 * ist; sie soll nur greifbar sein, nicht laut.
 *
 * groesse="xs" für die Fälle, in denen die Zeile ringsum in text-xs steht
 * (die Wegpunkt-Zeile in NeueStreckeForm). ton="gedaempft" für die, die
 * neben einer wichtigeren Handlung stehen und ihr nicht die Aufmerksamkeit
 * streitig machen sollen ("Passwort vergessen?" über dem Anmelden-Knopf,
 * "Wertung entfernen" neben den Sternen).
 *
 * Beides Parameter und keine angehängten Klassen: lib/utils/cn.ts ist ein
 * String-Join, kein tailwind-merge — ein angehängtes text-xs setzt sich
 * gegen das eingebaute text-sm nicht verlässlich durch.
 */
export function textAktionClassName({
  groesse = "sm",
  ton = "akzent",
  className,
}: {
  groesse?: "sm" | "xs";
  ton?: "akzent" | "gedaempft";
  className?: string;
} = {}): string {
  return cn(
    "inline-flex min-h-11 items-center gap-1 rounded-sm font-medium",
    groesse === "xs" ? "text-xs" : "text-sm",
    ton === "gedaempft" ? "text-muted hover:text-foreground" : "text-accent",
    "transition-colors duration-fast hover:underline",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className,
  );
}
