"use client";

import Link from "next/link";
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
//   hrefFor  — die Auswahl steht in der URL. Für /leaderboards, wo die
//              Listen die Seite ausmachen: die Seite bleibt Server
//              Component, der Zurück-Knopf funktioniert, und ein Link auf
//              eine Klasse ist teilbar.
export default function MotorklassenChips({
  klassen,
  aktiv,
  onChange,
  hrefFor,
  label,
  vorne,
}: {
  klassen: Motorklasse[];
  aktiv: Motorklasse | null;
  onChange?: (klasse: Motorklasse | null) => void;
  hrefFor?: (klasse: Motorklasse | null) => string;
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
      <Chip aktiv={aktiv === null} onChange={onChange} hrefFor={hrefFor} wert={null}>
        Alle
      </Chip>
      {sichtbar.map((k) => (
        <Chip
          key={k.id}
          aktiv={aktiv === k.id}
          onChange={onChange}
          hrefFor={hrefFor}
          wert={k.id}
          title={k.regel}
        >
          {k.label}
        </Chip>
      ))}
    </div>
  );
}

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
  hrefFor,
  title,
  children,
}: {
  aktiv: boolean;
  wert: Motorklasse | null;
  onChange?: (klasse: Motorklasse | null) => void;
  hrefFor?: (klasse: Motorklasse | null) => string;
  title?: string;
  children: React.ReactNode;
}) {
  if (hrefFor) {
    return (
      <Link
        href={hrefFor(wert)}
        title={title}
        // Kein aria-pressed an einem Link: aktiv heisst hier "das ist die
        // Seite, auf der du gerade bist".
        aria-current={aktiv ? "true" : undefined}
        // Der Sprung nach oben wäre hier falsch — die Leiste steht mitten
        // auf der Seite, und ihr Ergebnis steht direkt darunter.
        scroll={false}
        className={chipClassName(aktiv)}
      >
        {children}
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
