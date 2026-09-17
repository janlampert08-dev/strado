import Card from "@/components/ui/Card";
import { mitAnzahl } from "@/lib/format";
import {
  fahrtenProFahrzeug,
  fahrtenProJahr,
  fahrtenProMonat,
  type FahrtFuerStatistik,
} from "@/lib/fahrtstatistik";

// Die Premium-Auswertung auf der Profilseite: dieselben Fahrten wie die vier
// Kacheln darüber, aber nach Jahr und nach Fahrzeug aufgeschlüsselt.
//
// Additives Gating (docs/premium-plan.md, Abschnitt 4): Die vier
// Lebenszeit-Kacheln bleiben unverändert für jeden sichtbar. Dieser Block
// kommt obendrauf und nimmt nichts weg — er fügt die Dimension hinzu, die
// dort fehlt, nämlich die Zeit und das Fahrzeug.
//
// Keine Dauer, kein Tempo, keine Bestzeit. Die Begründung steht im Kopf von
// lib/fahrtstatistik.ts: das eine offene Bein von Audit-Befund A1 ist genau
// dauer_sekunden, und AGB Ziff. 11.3 sagt, Strado sei kein Wettbewerb um
// Geschwindigkeit.

// Sichtbar bleibt der Anfangsbuchstabe: zwölf Balken nebeneinander lassen
// auf einem schmalen Telefon keine drei Buchstaben zu. Für sich genommen ist
// er aber mehrdeutig — drei J, zwei M, zwei A —, und das lässt sich nur aus
// der Position im Jahr auflösen, die eine Vorlesehilfe nicht sieht. Deshalb
// steht daneben die ausgeschriebene Liste, die in den zugänglichen Namen
// jedes Balkens geht.
const MONATSKUERZEL = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONATE_LANG = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

interface FahrzeugName {
  id: string;
  marke: string;
  modell: string;
}

function zahl(wert: number): string {
  return wert.toLocaleString("de-CH");
}

export default function FahrtStatistik({
  fahrten,
  fahrzeuge,
}: {
  fahrten: readonly FahrtFuerStatistik[];
  fahrzeuge: readonly FahrzeugName[];
}) {
  const jahre = fahrtenProJahr(fahrten);

  // Ohne eine einzige auswertbare Fahrt hat dieser Block nichts zu sagen.
  // Eine Tabelle mit lauter Nullen wäre kein Angebot, sondern ein Vorwurf.
  if (jahre.length === 0) {
    return (
      <p className="text-sm text-muted">
        Sobald du deine erste Fahrt aufgezeichnet hast, steht hier dein Jahr — nach Jahren und
        nach Fahrzeugen aufgeschlüsselt.
      </p>
    );
  }

  const proFahrzeug = fahrtenProFahrzeug(fahrten);
  const neuestesJahr = jahre[0].jahr;
  const monate = fahrtenProMonat(fahrten, neuestesJahr);
  const monatsSpitze = Math.max(...monate);

  const nameVon = new Map(fahrzeuge.map((f) => [f.id, `${f.marke} ${f.modell}`]));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Nach Jahr</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-1 pr-3 font-medium">Jahr</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Fahrten</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">km</th>
                <th scope="col" className="py-1 text-right font-medium">Höhenmeter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jahre.map((zeile) => (
                <tr key={zeile.jahr}>
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {zeile.jahr}
                  </th>
                  <td className="py-2 pr-3 text-right">{zahl(zeile.fahrten)}</td>
                  <td className="py-2 pr-3 text-right">
                    {zahl(zeile.km)}
                    {/* Der Vergleich fehlt bewusst, wo das Vorjahr eine Lücke
                        ist — siehe kmGegenVorjahr in lib/fahrtstatistik.ts. */}
                    {zeile.kmGegenVorjahr !== null && zeile.kmGegenVorjahr !== 0 && (
                      <span
                        className={
                          zeile.kmGegenVorjahr > 0 ? "ml-1.5 text-success" : "ml-1.5 text-muted"
                        }
                      >
                        {zeile.kmGegenVorjahr > 0 ? "+" : "−"}
                        {zahl(Math.abs(zeile.kmGegenVorjahr))}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">{zahl(zeile.hoehenmeter)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{neuestesJahr} über die Monate</h3>
        {monatsSpitze === 0 ? (
          <p className="text-sm text-muted">Keine Fahrten in {neuestesJahr}.</p>
        ) : (
          <>
            {/* Reine Auszeichnung, kein Diagramm-Paket: zwölf Balken, deren
                Höhe sich am stärksten Monat bemisst. Die Zahlen stehen in
                aria-label, damit die Kurve nicht nur visuell existiert. */}
            <ol className="flex h-20 items-end gap-1" aria-label={`Fahrten pro Monat ${neuestesJahr}`}>
              {monate.map((anzahl, index) => (
                <li
                  key={MONATSKUERZEL[index] + index}
                  className="flex flex-1 flex-col items-center gap-1"
                  // aria-label auf dem <li> ERSETZT dessen Inhalt, es
                  // ergänzt ihn nicht: der Monatsbuchstabe im <span> darunter
                  // erreicht eine Vorlesehilfe also gar nicht. Ohne den Monat
                  // im Label selbst blieben zwölf Mal nur "N Fahrten" übrig,
                  // in einer Reihenfolge, die man raten müsste.
                  aria-label={`${MONATE_LANG[index]}: ${mitAnzahl(anzahl, "Fahrt", "Fahrten")}`}
                >
                  <div
                    className={anzahl > 0 ? "w-full rounded-sm bg-accent" : "w-full rounded-sm bg-border"}
                    style={{ height: `${anzahl > 0 ? Math.max(8, (anzahl / monatsSpitze) * 56) : 2}px` }}
                  />
                  <span className="text-[0.625rem] text-muted">{MONATSKUERZEL[index]}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Nach Fahrzeug</h3>
        <ul className="flex flex-col gap-2">
          {proFahrzeug.map((zeile) => (
            <Card
              key={zeile.fahrzeugId ?? "ohne-fahrzeug"}
              surface
              as="li"
              className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="truncate">
                {zeile.fahrzeugId === null
                  ? "Ohne Fahrzeug"
                  : (nameVon.get(zeile.fahrzeugId) ?? "Gelöschtes Fahrzeug")}
              </span>
              <span className="shrink-0 text-muted tabular-nums">
                {zahl(zeile.fahrten)} · {zahl(zeile.km)} km · {zahl(zeile.hoehenmeter)} m
              </span>
            </Card>
          ))}
        </ul>
      </section>
    </div>
  );
}
