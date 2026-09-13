"use client";

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
export default function MotorklassenChips({
  klassen,
  aktiv,
  onChange,
  label,
}: {
  klassen: Motorklasse[];
  aktiv: Motorklasse | null;
  onChange: (klasse: Motorklasse | null) => void;
  /** Für Screenreader: worauf sich die Auswahl bezieht. */
  label: string;
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
      <Chip aktiv={aktiv === null} onClick={() => onChange(null)}>
        Alle
      </Chip>
      {sichtbar.map((k) => (
        <Chip key={k.id} aktiv={aktiv === k.id} onClick={() => onChange(k.id)} title={k.regel}>
          {k.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  aktiv,
  onClick,
  title,
  children,
}: {
  aktiv: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={aktiv}
      className={cn(
        // min-h-9 wie die kleinen Schaltflächen in components/ui/Button.tsx —
        // diese Leiste wird im Zweifel im Fahrzeug bedient.
        "min-h-9 shrink-0 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-fast",
        aktiv
          ? "border-accent bg-accent text-background"
          : "border-border text-muted hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
