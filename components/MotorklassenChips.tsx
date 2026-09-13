"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { MOTORKLASSEN } from "@/lib/motorklassen";
import type { Motorklasse } from "@/types/database";
import { cn } from "@/lib/utils/cn";

// Die Klassenauswahl als waagrecht scrollende Chip-Leiste.
//
// "Alle" steht immer vorn und ist die Voreinstellung: Ohne Auswahl sieht
// eine Liste aus wie vor der Einführung der Klassen, und niemand verliert
// eine Rangliste, in der er gerade vorne steht.
//
// `klassen` schränkt auf die Klassen ein, in denen es überhaupt etwas zu
// sehen gibt. Pro Strecke sind das oft ein oder zwei — fünf leere Chips
// wären dort nur Rauschen. Die Reihenfolge kommt aus dem Katalog, nicht aus
// den Daten, damit sie sich beim Streckenwechsel nicht umsortiert.
//
// Bewusst kein <select>: Die Auswahl hat höchstens sieben Einträge, und ein
// Chip zeigt im Gegensatz zu einem zugeklappten Auswahlfeld sofort, dass es
// hier überhaupt etwas zu wählen gibt.
//
// Zwei Betriebsarten, weil die beiden Oberflächen unterschiedlich teuer sind:
//
//   onChange — die Auswahl lebt im Client-State. Für die Streckenseite, die
//              Karte, Fotos, Bewertungen und Wetter mitlädt und die nicht
//              bei jedem Chip-Tipp komplett neu berechnet werden soll.
//   hrefs    — die Auswahl steht in der URL. Für /leaderboards, wo die
//              Listen die Seite ausmachen: die Seite bleibt Server
//              Component, der Zurück-Knopf funktioniert, und ein Link auf
//              eine Klasse ist teilbar.
//
// Warum `hrefs` eine fertige Zuordnung ist und keine Funktion: Diese Datei
// ist "use client", /leaderboards ist eine Server Component. React kann
// keine Funktion über diese Grenze reichen — der Versuch endet mit
// "Functions cannot be passed directly to Client Components", und zwar
// beim Rendern, also erst bei einer echten Anfrage. Weder `next build`
// noch die Testsuite sehen das. Eine Zuordnung aus Zeichenketten ist
// serialisierbar, und der Typ schliesst den Rückfall aus.
export default function MotorklassenChips({
  klassen,
  aktiv,
  onChange,
  hrefs,
  label,
  vorne,
}: {
  klassen: Motorklasse[];
  aktiv: Motorklasse | null;
  onChange?: (klasse: Motorklasse | null) => void;
  /**
   * Ziel je Chip, vorberechnet von der Seite. Schlüssel ist die Klassen-ID,
   * für "Alle" die Konstante {@link CHIP_ALLE}. Bewusst keine Funktion —
   * siehe oben.
   */
  hrefs?: Record<string, string>;
  /** Für Screenreader: worauf sich die Auswahl bezieht. */
  label: string;
  /** Zusätzlicher Chip ganz vorn, z.B. "Meine Klasse". */
  vorne?: React.ReactNode;
}) {
  // Nur anzeigen, wenn es etwas zu wählen gibt: bei genau einer belegten
  // Klasse wären "Alle" und diese eine Klasse dieselbe Liste.
  if (klassen.length < 2) return null;

  const sichtbar = MOTORKLASSEN.filter((k) => klassen.includes(k.id));

  return (
    <div
      role="group"
      aria-label={label}
      // -mx/px: die Leiste darf am Rand durchscrollen, ohne dass die Chips
      // am Container abgeschnitten wirken.
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {vorne}
      <Chip aktiv={aktiv === null} onChange={onChange} href={hrefs?.[CHIP_ALLE]} wert={null}>
        Alle
      </Chip>
      {sichtbar.map((k) => (
        <Chip
          key={k.id}
          aktiv={aktiv === k.id}
          onChange={onChange}
          href={hrefs?.[k.id]}
          wert={k.id}
          title={k.regel}
        >
          {k.label}
        </Chip>
      ))}
    </div>
  );
}

// Schlüssel des "Alle"-Eintrags in `hrefs`. Als Konstante, damit Seite und
// Leiste sich nicht über eine abgetippte Zeichenkette verständigen müssen.
export const CHIP_ALLE = "alle";

// Die Chip-Optik an einer Stelle, damit die beiden Betriebsarten und der
// "Meine Klasse"-Chip nicht auseinanderlaufen.
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

function Chip({
  aktiv,
  wert,
  onChange,
  href,
  title,
  children,
}: {
  aktiv: boolean;
  wert: Motorklasse | null;
  onChange?: (klasse: Motorklasse | null) => void;
  href?: string;
  title?: string;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <Link
        href={href}
        title={title}
        // Kein aria-pressed an einem Link: aktiv heisst hier "das ist die
        // Seite, auf der du gerade bist".
        aria-current={aktiv ? "true" : undefined}
        // Der Sprung nach oben wäre hier falsch — die Leiste steht mitten
        // auf der Seite, und ihr Ergebnis steht direkt darunter.
        scroll={false}
        className={chipClassName(aktiv)}
      >
        <ChipInhalt>{children}</ChipInhalt>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onChange?.(wert)}
      title={title}
      aria-pressed={aktiv}
      className={chipClassName(aktiv)}
    >
      {children}
    </button>
  );
}

// Sofortige Rückmeldung auf den Tipp, solange die neue Liste unterwegs ist.
//
// Die Ladegrenzen in app/leaderboards/page.tsx sind die eigentliche
// Verbesserung — die Leiste bleibt beim Klassenwechsel stehen, statt mit der
// ganzen Seite durch ein Skelett ersetzt zu werden. Diese Anzeige deckt die
// kurze Spanne davor ab, in der sonst gar nichts passiert.
//
// useLinkStatus verlangt einen Nachfahren des Links, deshalb diese eigene
// kleine Komponente. Gedimmt wird nur die Deckkraft eines Elements, das
// ohnehin immer dasteht: Die Next-Doku warnt ausdrücklich davor, hier etwas
// ein- und auszublenden — das verschöbe bei jedem Klick das Layout der
// ganzen Leiste. Ist das Ziel bereits vorgeladen, entfällt der Zustand
// ohnehin, und man sieht nichts.
function ChipInhalt({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className={cn("transition-opacity duration-fast", pending && "opacity-60")}>
      {children}
    </span>
  );
}
