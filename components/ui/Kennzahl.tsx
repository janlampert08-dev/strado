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
  // Subgrid statt Flex: jede Kachel belegt vier Zeilen des umgebenden
  // Rasters (Beschriftung, Wert, Zusatz, Fuss), und alle Kacheln einer Reihe
  // teilen sich diese Zeilen. Damit stehen die Werte auf einer Linie, auch
  // wenn eine Beschriftung umbricht ("Höchster Punkt") oder eine Kachel als
  // einzige ein Abzeichen trägt.
  //
  // Vorher zwei mt-auto (Wert und Fuss) in einer Flex-Spalte: der freie
  // Platz ging an beide, und auf /fahrten/[id] stand "22.2 km" unten in
  // seiner Kachel, "15:27 min" daneben oben (Re-Audit 2026-09-23). Die
  // leeren Zeilen werden immer gerendert — ein Subgrid braucht in jeder
  // Kachel gleich viele Kinder, sonst verrutschen die Zeilen.
  return (
    <div
      className={cn(
        "row-span-4 grid grid-rows-subgrid gap-y-1 rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <dt className="flex items-start gap-1.5 text-sm text-muted">{beschriftung}</dt>
      {/* whitespace-nowrap: "33.1 km" und "~22 min" brachen in der
          Vierer-Reihe der Streckenseite zwischen Zahl und Einheit um. */}
      <dd className="self-end text-title font-semibold whitespace-nowrap tabular-nums">{wert}</dd>
      <dd className="row-start-3 text-xs tabular-nums text-muted empty:hidden">{zusatz ?? null}</dd>
      <dd className="row-start-4 self-end empty:hidden">{fuss ?? null}</dd>
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
// Nicht über className: entstanden, als lib/utils/cn.ts noch kein
// tailwind-merge war und ein angehängtes grid-cols-3 das eingebaute
// grid-cols-2 nicht aufhob. Seit 2026-09-23 ginge es; der Parameter bleibt,
// weil er die eine erlaubte Abweichung benennt, statt jede zuzulassen.
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
  return <dl className={cn("grid gap-x-3 gap-y-3", raster[spalten], className)}>{children}</dl>;
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
  // Immer rendern, Fehlendes als "keine Angabe": vorher filterte die Zeile
  // Einträge mit "—" heraus und verschwand ganz, wenn alle fehlten — dann
  // sah eine Strecke ohne Steigung, Tempolimit und Wetter aus wie eine ohne
  // Detailzeile, statt wie eine ohne Daten. (Gegen die frühere Lesart in
  // docs/design-vereinfachung.md, die das Verschweigen als Entscheidung
  // festhielt: eine Zeile aus drei Gedankenstrichen sagt nichts, aber eine
  // fehlende Zeile sagt, es gäbe nichts zu sagen.)
  return (
    <p className={cn("text-sm leading-relaxed text-muted", className)}>
      {eintraege.map((e, i) => {
        const fehlt = e.wert.trim() === "" || e.wert === "—";
        return (
          <span key={e.beschriftung}>
            {i > 0 && <span aria-hidden="true"> · </span>}
            {e.beschriftung}{" "}
            {fehlt ? (
              "keine Angabe"
            ) : (
              <span className="tabular-nums text-foreground">{e.wert}</span>
            )}
          </span>
        );
      })}
    </p>
  );
}
