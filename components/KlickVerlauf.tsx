import { balkenHoehe, type VerlaufReihe } from "@/lib/creatorKennzahlen";
import { mitAnzahl } from "@/lib/format";

// Tagesdatum für die Beschriftung. de-CH, weil die Oberfläche
// deutschsprachig ist; die Zeitzone ist ausdrücklich UTC, weil
// creator_verlauf() die Tage in der Zeitzone der Datenbank bildet (siehe
// Migration 0091) — ohne das verschöbe der Browser das Datum um einen Tag.
const DATUM = new Intl.DateTimeFormat("de-CH", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

function formatiere(tag: string): string {
  const datum = new Date(`${tag}T00:00:00Z`);
  return Number.isNaN(datum.getTime()) ? tag : DATUM.format(datum);
}

// Der Klickverlauf als Balkenreihe — dieselbe Auszeichnung wie das
// Monatsdiagramm in FahrtStatistik.tsx, absichtlich: kein Diagramm-Paket
// (Kernregel 15), kein zweites Idiom für dieselbe Sache, und keine
// Fremd-Origin, die die CSP ohnehin blockierte.
//
// Skaliert wird auf den Höchstwert DIESER Reihe, nicht über alle Codes
// hinweg: ein Link mit tausend Klicks drückte sonst jeden anderen zu einer
// leeren Linie zusammen.
//
// Gezeigt werden Klicks, nicht Registrierungen: Registrierungen sind so
// selten, dass eine Tagesreihe daraus fast immer leer aussähe — die Zahl
// steht daneben. Der Verlauf beantwortet die andere Frage: hat das Video
// von gestern etwas bewegt?
export default function KlickVerlauf({ reihe }: { reihe: VerlaufReihe }) {
  const gesamt = reihe.tage.reduce((summe, t) => summe + t.klicks, 0);

  if (gesamt === 0) {
    return (
      <p className="text-xs text-muted">
        In den letzten {reihe.tage.length} Tagen kein Aufruf.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <ol
        className="flex h-12 items-end gap-px"
        aria-label={`Aufrufe pro Tag, letzte ${reihe.tage.length} Tage`}
      >
        {reihe.tage.map((tag) => (
          // aria-label auf dem <li> ERSETZT dessen Inhalt — hier gibt es
          // keinen, der Balken ist eine leere Fläche. Ohne Datum im Label
          // bliebe eine Reihe aus "3 Klicks" in einer Reihenfolge, die man
          // raten müsste (dieselbe Lehre wie in FahrtStatistik.tsx).
          <li
            key={tag.tag}
            className="flex min-w-0 flex-1 items-end self-stretch"
            aria-label={`${formatiere(tag.tag)}: ${mitAnzahl(tag.klicks, "Aufruf", "Aufrufe")}`}
          >
            <div
              className={
                tag.klicks > 0
                  ? "w-full rounded-sm bg-accent"
                  : "w-full rounded-sm bg-border"
              }
              // Inline, weil der Wert je Tag anders ist: eine Tailwind-Klasse
              // pro möglicher Höhe gibt es nicht, und arbitrary values liest
              // Tailwind zur Bauzeit aus dem Quelltext, nicht zur Laufzeit.
              // Ein Tag ohne Aufruf bleibt als dünner Strich stehen, damit
              // die Lücke sichtbar ist statt unsichtbar.
              style={{
                height:
                  tag.klicks > 0
                    ? `${balkenHoehe(tag.klicks, reihe.hoechstwert)}%`
                    : "2px",
              }}
            />
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        {mitAnzahl(gesamt, "Aufruf", "Aufrufe")} seit{" "}
        {formatiere(reihe.tage[0].tag)}, Spitze{" "}
        {reihe.hoechstwert.toLocaleString("de-CH")} an einem Tag.
      </p>
    </div>
  );
}
