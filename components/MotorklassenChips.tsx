"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import {
  FAHRZEUGTYPEN,
  MOTORKLASSEN,
  fahrzeugtypdefinition,
  filterTyp,
  istMotorklasse,
  motorklassendefinition,
} from "@/lib/motorklassen";
import type { Klassenfilter } from "@/lib/motorklassen";
import type { Motorklasse } from "@/types/database";
import { chipClassName, unterChipClassName } from "@/components/motorklassenChipStil";
import { cn } from "@/lib/utils/cn";

// Die Klassenauswahl als zwei waagrecht scrollende Chip-Zeilen.
//
// ZWEI ZEILEN, NICHT EINE
//
// Bis dahin standen alle sechs Klassen nebeneinander: "A1", "A 35 kW",
// "A offen", "bis 150 PS", "151–299 PS", "ab 300 PS". Das ist eine Liste aus
// zwei Welten, die nichts miteinander zu tun haben — ein Motorrad wird nie
// in eine Autoklasse hochgestuft und umgekehrt (siehe motorklasse_hoehere()
// in 0080). Wer ein Auto fährt, las drei Chips, die ihn nie betreffen, und
// die Beschriftungen mussten das allein tragen: dass "A1" ein Motorrad
// meint, weiss nur, wer die Kategorien kennt.
//
// Jetzt wählt die obere Zeile die Welt (Autos oder Motorräder) und die
// untere das Leistungsband darin. Die obere Zeile ist zugleich eine eigene
// Rangliste: "Autos" heisst alle Autos, unabhängig von der Leistung.
//
// "Alle" steht weiterhin ganz vorn und ist die Voreinstellung: Ohne Auswahl
// sieht eine Liste aus wie vor der Einführung der Klassen, und niemand
// verliert eine Rangliste, in der er gerade vorne steht. "Alle" ist dabei
// mehr als die Summe der beiden Typen — Fahrten ohne Fahrzeug oder ohne
// Leistungsangabe tragen gar keine Klasse und erscheinen nur dort.
//
// `klassen` schränkt auf die Klassen ein, in denen es überhaupt etwas zu
// sehen gibt. Pro Strecke sind das oft ein oder zwei — leere Chips wären
// dort nur Rauschen. Die Reihenfolge kommt aus dem Katalog, nicht aus den
// Daten, damit sie sich beim Streckenwechsel nicht umsortiert.
//
// Zwei Betriebsarten, weil die beiden Oberflächen unterschiedlich teuer sind:
//
//   onChange — die Auswahl lebt im Client-State. Für die Streckenseite, die
//              Karte, Fotos, Bewertungen und Wetter mitlädt und die nicht
//              bei jedem Chip-Tipp komplett neu berechnet werden soll.
//   hrefs    — die Auswahl steht in der URL. Für /ranglisten, wo die
//              Listen die Seite ausmachen: die Seite bleibt Server
//              Component, der Zurück-Knopf funktioniert, und ein Link auf
//              eine Klasse ist teilbar.
//
// Warum `hrefs` eine fertige Zuordnung ist und keine Funktion: Diese Datei
// ist "use client", /ranglisten ist eine Server Component. React kann
// keine Funktion über diese Grenze reichen — der Versuch endet mit
// "Functions cannot be passed directly to Client Components", und zwar
// beim Rendern, also erst bei einer echten Anfrage. Weder `next build`
// noch die Testsuite sehen das. Eine Zuordnung aus Zeichenketten ist
// serialisierbar, und der Typ schliesst den Rückfall aus.
//
// "Alle" hat aus demselben Grund ein EIGENES Feld und steht nicht in der
// Zuordnung: Dort bräuchte es einen Schlüssel, den beide Seiten kennen, und
// eine aus dieser "use client"-Datei exportierte Konstante ist auf der
// Serverseite kein String, sondern ein Client-Verweis. Die Schlüssel der
// Zuordnung stammen deshalb ausnahmslos aus lib/motorklassen.ts — einem
// Modul ohne "use client".
export default function MotorklassenChips({
  klassen,
  aktiv,
  onChange,
  hrefAlle,
  hrefs,
  label,
  vorne,
}: {
  /** Die Motorklassen, in denen es hier überhaupt Einträge gibt. */
  klassen: Motorklasse[];
  aktiv: Klassenfilter | null;
  onChange?: (filter: Klassenfilter | null) => void;
  /** Ziel des "Alle"-Chips. Eigenes Feld, siehe oben. */
  hrefAlle?: string;
  /**
   * Ziel je Chip, vorberechnet von der Seite. Schlüssel ist die
   * Fahrzeugtyp- oder Klassen-ID — Werte aus lib/motorklassen.ts, also aus
   * einem Modul ohne "use client". Bewusst keine Funktion, siehe oben.
   */
  hrefs?: Partial<Record<Klassenfilter, string>>;
  /** Für Screenreader: worauf sich die Auswahl bezieht. */
  label: string;
  /** Zusätzlicher Chip ganz vorn, z.B. "Meine Klasse". */
  vorne?: React.ReactNode;
}) {
  // Nur anzeigen, wenn es etwas zu wählen gibt: bei genau einer belegten
  // Klasse wären "Alle" und diese eine Klasse dieselbe Liste.
  if (klassen.length < 2) return null;

  // Ein Fahrzeugtyp erscheint, sobald eine seiner Klassen belegt ist.
  const typen = FAHRZEUGTYPEN.filter((t) =>
    klassen.some((k) => motorklassendefinition(k).typ === t.id),
  );

  // Die obere Zeile zeigt den gewählten Typ auch dann als aktiv, wenn
  // darunter schon ein Band gewählt ist: sie sagt, in welcher Welt man sich
  // befindet. Ein erneuter Tipp darauf führt zurück zur ganzen Welt.
  const aktiverTyp = aktiv === null ? null : filterTyp(aktiv);

  const unterklassen =
    aktiverTyp === null
      ? []
      : MOTORKLASSEN.filter((k) => k.typ === aktiverTyp && klassen.includes(k.id));

  // Dieselbe Überlegung wie oben, eine Ebene tiefer: bei nur einem belegten
  // Band wären "Alle Autos" und dieses Band dieselbe Liste.
  const zeigtUnterzeile = aktiverTyp !== null && unterklassen.length >= 2;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label={label}
        // -mx/px: die Leiste darf am Rand durchscrollen, ohne dass die Chips
        // am Container abgeschnitten wirken.
        className="-mx-1 flex gap-1.5 overflow-x-auto reiter-scroller px-1 pb-1"
      >
        {vorne}
        <Chip aktiv={aktiv === null} onChange={onChange} href={hrefAlle} wert={null}>
          Alle
        </Chip>
        {typen.map((t) => (
          <Chip
            key={t.id}
            aktiv={aktiverTyp === t.id}
            onChange={onChange}
            href={hrefs?.[t.id]}
            wert={t.id}
          >
            {t.label}
          </Chip>
        ))}
      </div>

      {zeigtUnterzeile && aktiverTyp !== null && (
        <div
          role="group"
          aria-label={`Leistungsklasse (${fahrzeugtypdefinition(aktiverTyp).label})`}
          className="-mx-1 flex gap-1.5 overflow-x-auto reiter-scroller px-1 pb-1"
        >
          <Chip
            aktiv={aktiv === aktiverTyp}
            onChange={onChange}
            href={hrefs?.[aktiverTyp]}
            wert={aktiverTyp}
            unter
          >
            Alle {fahrzeugtypdefinition(aktiverTyp).label}
          </Chip>
          {unterklassen.map((k) => (
            <Chip
              key={k.id}
              aktiv={aktiv === k.id}
              onChange={onChange}
              href={hrefs?.[k.id]}
              wert={k.id}
              title={k.regel}
              unter
            >
              {k.label}
            </Chip>
          ))}
        </div>
      )}

      {/* Die Regel sichtbar, sobald eine Klasse gewählt ist. Sie stand nur
          im title-Attribut der Chips — auf einem Telefon gibt es kein
          Schweben, also war "A 35 kW" dort eine Abkürzung ohne Auflösung,
          und genau zwischen A1 und A 35 kW muss man wissen, wo man steht. */}
      {aktiv !== null && istMotorklasse(aktiv) && (
        <p className="px-1 text-xs text-muted">
          {motorklassendefinition(aktiv).label}: {motorklassendefinition(aktiv).regel}
        </p>
      )}
    </div>
  );
}

function Chip({
  aktiv,
  wert,
  onChange,
  href,
  title,
  unter = false,
  children,
}: {
  aktiv: boolean;
  wert: Klassenfilter | null;
  onChange?: (filter: Klassenfilter | null) => void;
  href?: string;
  title?: string;
  /** Chip der zweiten Zeile — kleiner, siehe motorklassenChipStil.ts. */
  unter?: boolean;
  children: React.ReactNode;
}) {
  const className = unter ? unterChipClassName(aktiv) : chipClassName(aktiv);

  if (href) {
    return (
      <Link
        href={href}
        title={title}
        // Kein aria-pressed an einem Link: aktiv heisst hier "das ist die
        // Seite, auf der du gerade bist".
        // "page", nicht "true": diese Chips sind Links, die die Adresse
        // ändern (hrefs-Betriebsart auf /ranglisten) — der gewählte Chip ist
        // also die aktuelle Seite und nicht bloss "irgendwie aktuell".
        aria-current={aktiv ? "page" : undefined}
        // Der Sprung nach oben wäre hier falsch — die Leiste steht mitten
        // auf der Seite, und ihr Ergebnis steht direkt darunter.
        scroll={false}
        className={className}
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
      className={className}
    >
      {children}
    </button>
  );
}

// Sofortige Rückmeldung auf den Tipp, solange die neue Liste unterwegs ist.
//
// Die Ladegrenzen in app/ranglisten/page.tsx sind die eigentliche
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
