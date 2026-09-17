import { cn } from "@/lib/utils/cn";

// Eine Zahl mit ihrer Beschriftung. Vorher stand dasselbe Muster fünfzehnmal
// von Hand in app/ — sieben auf der Streckenseite, vier auf der Fahrtseite,
// vier im Profil — und zwar mit uneinheitlicher Betonung: die jeweils ersten
// beiden Kacheln text-title/600, der Rest einmal font-mono, einmal text-lg.
// Gleiche Rolle, drei Grössen, kein Grund.
//
// Deshalb gibt es hier genau EINE Betonungsstufe. Wer eine Kachel
// hervorheben will, tut das über ihre Position im Raster, nicht über ihre
// Schriftgrösse.
//
// Die zweite Regel steht nicht im Code, sondern in docs/design-vereinfachung.md
// (Anhang A2): höchstens vier Kacheln je Raster. Was darüber hinausgeht,
// wird eine Zeile darunter — siehe Kennzahlenzeile weiter unten.
export default function Kennzahl({
  beschriftung,
  wert,
  zusatz,
  fuss,
  className,
}: {
  beschriftung: React.ReactNode;
  wert: React.ReactNode;
  /** Zweite, kleinere Zeile unter dem Wert (z. B. "12:04 in Bewegung"). */
  zusatz?: React.ReactNode;
  /** Freier Platz ganz unten — für ein Abzeichen statt einer Zahl. Trägt
   *  bewusst keine Schriftvorgaben, anders als `zusatz`. */
  fuss?: React.ReactNode;
  className?: string;
}) {
  // Beschriftung, Wert und Zusatz stehen oben zusammen; nur der `fuss`
  // wird nach unten geschoben (mt-auto).
  //
  // Vorher stand hier justify-between, und das ging gut, solange alle
  // Kacheln einer Zeile gleich gebaut waren: dann sind sie gleich hoch,
  // es bleibt kein freier Platz, und die Verteilung fällt nicht auf.
  // Sobald eine Kachel eine Zeile mehr trägt, streckt das Raster die
  // übrigen mit — und justify-between schob deren Wert an den unteren
  // Rand. Auf /fahrten/[id] (eine Zeit-Kachel mit Zusatz und Abzeichen,
  // drei ohne) standen die vier Zahlen damit auf zwei Höhen; auf
  // /creator, wo die erste Trichterstufe keinen Prozentwert hat und die
  // drei Zahlen genau zum Vergleich nebeneinander stehen, wäre es der
  // Unterschied zwischen einer Reihe und drei Kacheln gewesen.
  //
  // Für gleich gebaute Zeilen (Strecken- und Profilseite) ändert sich
  // nichts: ohne freien Platz verteilt justify-between nichts.
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <dt className="flex items-center gap-1.5 text-sm text-muted">{beschriftung}</dt>
      {/* whitespace-nowrap: "33.1 km" und "~22 min" brachen in der
          Vierer-Reihe der Streckenseite zwischen Zahl und Einheit um. */}
      <dd className="text-title font-semibold whitespace-nowrap tabular-nums">{wert}</dd>
      {zusatz !== undefined && zusatz !== null && (
        <dd className="text-xs tabular-nums text-muted">{zusatz}</dd>
      )}
      {fuss !== undefined && fuss !== null && <dd className="mt-auto pt-1">{fuss}</dd>}
    </div>
  );
}

// Das Raster darum — höchstens vier Kacheln, damit auf dem Telefon nicht
// vier Zeilen Kästen entstehen, bevor der eigentliche Inhalt beginnt.
//
// `spalten` ist die eine erlaubte Abweichung, und sie hat genau einen
// Grund: eine Reihe, deren Nebeneinander selbst die Aussage ist. Auf
// /creator sind die drei Kacheln ein Trichter (Aufrufe → Konten → Abos);
// im Standardraster bräche er auf dem Telefon in 2 + 1 um, und zwei plus
// eins liest sich nicht als Trichter, sondern als Kachel, die übrig blieb.
//
// Nicht über className, weil lib/utils/cn.ts kein tailwind-merge ist: ein
// angehängtes grid-cols-3 höbe das eingebaute grid-cols-2 nicht auf,
// sondern überliesse die Entscheidung der Reihenfolge im Stylesheet. Wer
// eine Vorgabe ändern muss, bekommt einen Parameter — dieselbe Regel, die
// dort ausgeschrieben steht.
const raster = {
  /** Der Normalfall: zwei Kacheln je Zeile auf dem Telefon, vier ab sm. */
  2: "grid-cols-2 sm:grid-cols-4",
  /** Eine Dreierreihe, die als Reihe gelesen werden muss — auch auf 390 px. */
  3: "grid-cols-3",
} as const;

export function Kennzahlen({
  spalten = 2,
  children,
  className,
}: {
  spalten?: keyof typeof raster;
  children: React.ReactNode;
  className?: string;
}) {
  return <dl className={cn("grid gap-3", raster[spalten], className)}>{children}</dl>;
}

// Der Rest, der nicht als Kachel taugt: eine Zeile aus Wertpaaren, mit
// Mittelpunkt getrennt. Auf der Streckenseite ersetzt das drei Kacheln
// (rund 160 px) durch eine Zeile (rund 24 px).
export function Kennzahlenzeile({
  eintraege,
  className,
}: {
  eintraege: { beschriftung: string; wert: string }[];
  className?: string;
}) {
  const sichtbar = eintraege.filter((e) => e.wert.trim() !== "" && e.wert !== "—");
  if (sichtbar.length === 0) return null;

  return (
    <p className={cn("text-sm leading-relaxed text-muted", className)}>
      {sichtbar.map((e, i) => (
        <span key={e.beschriftung}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {e.beschriftung} <span className="tabular-nums text-foreground">{e.wert}</span>
        </span>
      ))}
    </p>
  );
}
