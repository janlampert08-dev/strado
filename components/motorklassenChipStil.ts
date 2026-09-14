import { cn } from "@/lib/utils/cn";

// Die Chip-Optik der Motorklassen-Leiste, an einer Stelle, damit die beiden
// Betriebsarten von MotorklassenChips und der "Meine Klasse"-Chip nicht
// auseinanderlaufen.
//
// WARUM DAS EINE EIGENE DATEI IST UND NICHT IN MotorklassenChips.tsx STEHT
//
// Diese Funktion wird aus einer Server Component heraus aufgerufen
// (MeineKlasseChip in app/leaderboards/page.tsx). Stünde sie in der
// "use client"-Datei, ersetzte React sie dort durch einen Client-Verweis:
// einen Stub, der beim Aufruf wirft mit "Attempted to call chipClassName()
// from the server but chipClassName is on the client".
//
// Die Regel dahinter: Aus einer "use client"-Datei darf eine Server
// Component nur KOMPONENTEN importieren. Jeder andere Export — eine
// Konstante, eine reine Funktion — ist auf der Serverseite kein Wert mehr,
// sondern ein Verweis. Solche geteilten Werte gehören deshalb in ein Modul
// ohne "use client"; von dort dürfen beide Seiten importieren.
export function chipClassName(aktiv: boolean): string {
  return cn(
    // min-h-9 wie die kleinen Schaltflächen in components/ui/Button.tsx —
    // diese Leiste wird im Zweifel im Fahrzeug bedient.
    "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-fast",
    aktiv
      ? "border-accent bg-accent text-background"
      : "border-border text-muted hover:border-border-strong hover:text-foreground",
  );
}

// Die zweite Zeile — die Leistungsbänder innerhalb des gewählten
// Fahrzeugtyps. Kleiner und ohne Vollfläche, damit auf einen Blick erkennbar
// bleibt, welche Zeile die Auswahl anführt und welche sie verfeinert.
export function unterChipClassName(aktiv: boolean): string {
  return cn(
    "inline-flex min-h-8 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-fast",
    aktiv
      ? "border-accent bg-accent-subtle text-accent"
      : "border-border text-muted hover:border-border-strong hover:text-foreground",
  );
}
