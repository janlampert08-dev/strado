import { cn } from "@/lib/utils/cn";

// Die Chip-Optik der Motorklassen-Leiste, an einer Stelle, damit die beiden
// Betriebsarten von MotorklassenChips und der "Meine Klasse"-Chip nicht
// auseinanderlaufen.
//
// WARUM DAS EINE EIGENE DATEI IST UND NICHT IN MotorklassenChips.tsx STEHT
//
// Diese Funktion wird aus einer Server Component heraus aufgerufen
// (MeineKlasseChip in app/ranglisten/page.tsx). Stünde sie in der
// "use client"-Datei, ersetzte React sie dort durch einen Client-Verweis:
// einen Stub, der beim Aufruf wirft mit "Attempted to call chipClassName()
// from the server but chipClassName is on the client". Genau das ist
// passiert — unbemerkt, weil der Aufruf hinter einer Bedingung lag, die bis
// dahin nie wahr wurde.
//
// Die Regel dahinter: Aus einer "use client"-Datei darf eine Server
// Component nur KOMPONENTEN importieren. Jeder andere Export — eine
// Konstante, eine reine Funktion — ist auf der Serverseite kein Wert mehr,
// sondern ein Verweis. Solche geteilten Werte gehören deshalb in ein Modul
// ohne "use client"; von dort dürfen beide Seiten importieren.
// lib/reactGrenze.test.ts hält diese Regel fest.
/**
 * @param gross 44 px statt 36 — der Mindestwert aus components/ui/IconButton.tsx.
 *
 * Ein Parameter und keine angehängte Klasse: entstanden, als lib/utils/cn.ts
 * noch ein String-Join war und ein zweites min-h-* das erste nicht
 * verlässlich überschrieb. Seit cn tailwind-merge ist, ginge es — der
 * Parameter bleibt, weil er die zwei erlaubten Höhen benennt.
 *
 * Gebraucht wird er im Fazit (components/RideSummaryForm.tsx): die
 * Fahrzeug-Chips haben dort die <select>-Liste ersetzt, die mit rund 42 px
 * GRÖSSER war als die 36 px, die sie zuerst bekamen — und der Kommentar
 * daneben versprach 44. Das ist der Schirm am Strassenrand, und die
 * Motorklasse entscheidet über die Wertung.
 *
 * Die Filterleiste auf /ranglisten bleibt bei 36: dort stehen bis zu neun
 * Chips in zwei Zeilen, und sie wird im Sitzen bedient.
 */
export function chipClassName(aktiv: boolean, gross = false): string {
  return cn(
    // relative + after: auch in der 36-px-Fassung eine 44-px-Tippfläche,
    // ohne die zwei Chipzeilen der Ranglisten höher zu machen.
    "relative inline-flex shrink-0 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-fast after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
    // Eigener Fokusring: ohne ihn blieb nur die Browser-Umrandung, und die
    // lag beim gewählten (vordergrundgefüllten) Chip in Hintergrundfarbe auf
    // Hintergrund — rund 1:1, also unsichtbar (Audit 2026-09-23).
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    gross ? "min-h-11" : "min-h-9",
    // Gewählt = gefüllt in der Vordergrundfarbe, wie ein Segment in
    // ui/SegmentedControl. Vorher blau gefüllt: dieselbe Rolle ("das ist
    // ausgewählt") sah in den Ranglisten anders aus als im Feed-Reiter und in
    // der Sichtbarkeitswahl, und Blau heisst in dieser App "tippen löst etwas
    // aus", nicht "ist gewählt".
    aktiv
      ? "border-foreground bg-foreground text-background"
      : "border-border-control text-muted hover:border-muted hover:text-foreground",
  );
}

// Die zweite Zeile — die Leistungsbänder innerhalb des gewählten
// Fahrzeugtyps. Kleiner und ohne Vollfläche, damit auf einen Blick erkennbar
// bleibt, welche Zeile die Auswahl anführt und welche sie verfeinert.
export function unterChipClassName(aktiv: boolean): string {
  return cn(
    // relative + after wie in der oberen Zeile: 32 px hoch dargestellt, 44 px
    // tippbar. Die Unterzeile war die einzige Chipreihe der App ohne diese
    // Vergrösserung — "A1" mass 38 × 32 und war damit das kleinste Ziel auf
    // /ranglisten, ausgerechnet in der Reihe, die man mit Handschuhen am
    // ehesten am Strassenrand antippt.
    "relative inline-flex min-h-8 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-fast after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
    aktiv
      ? "border-foreground bg-surface text-foreground"
      : "border-border-control text-muted hover:border-muted hover:text-foreground",
  );
}
