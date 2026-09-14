"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { MOTORKLASSEN } from "@/lib/motorklassen";
import type { Motorklasse } from "@/types/database";
import { cn } from "@/lib/utils/cn";
import { chipClassName } from "@/components/motorklassenChipStil";

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
//
// Warum "Alle" ein EIGENES Feld hat und nicht in derselben Zuordnung steht:
// Dort brauchte es einen Schlüssel, den beide Seiten kennen — und dieser
// Schlüssel war eine Konstante aus dieser "use client"-Datei. Die Seite
// importierte sie, bekam von React aber keinen String, sondern einen
// Client-Verweis, und `{ [CHIP_ALLE]: ... }` machte daraus per String() den
// Quelltext eines werfenden Stubs. Auf dem Client fand die Leiste den
// Eintrag nicht mehr und stellte "Alle" als Knopf ohne Wirkung dar: ein
// Chip, der aussieht wie ein Chip und nichts tut. Ein eigenes Feld braucht
// gar keinen geteilten Schlüssel und kann deshalb nicht so brechen.
export default function MotorklassenChips({
  klassen,
  aktiv,
  onChange,
  hrefAlle,
  hrefs,
  label,
  vorne,
}: {
  klassen: Motorklasse[];
  aktiv: Motorklasse | null;
  onChange?: (klasse: Motorklasse | null) => void;
  /** Ziel des "Alle"-Chips. Eigenes Feld, siehe oben. */
  hrefAlle?: string;
  /**
   * Ziel je Klassen-Chip, vorberechnet von der Seite. Schlüssel ist die
   * Klassen-ID — ein Wert aus lib/motorklassen.ts, also aus einem Modul
   * ohne "use client". Bewusst keine Funktion, siehe oben.
   */
  hrefs?: Partial<Record<Motorklasse, string>>;
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
      <Chip aktiv={aktiv === null} onChange={onChange} href={hrefAlle} wert={null}>
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
