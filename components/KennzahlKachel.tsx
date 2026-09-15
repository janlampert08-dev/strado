import Card from "@/components/ui/Card";
import { anteil } from "@/lib/creatorKennzahlen";

// Eine Zahl gross, darunter woraus sie entstanden ist. Drei davon
// nebeneinander sind der Trichter, den /creator zeigt: Klicks → Konten →
// Abos.
//
// anteilVon ist der Nenner der vorigen Stufe. Er wird nur gezeigt, wenn es
// ihn gibt — anteil() gibt bei einem Nenner von 0 bewusst null zurück statt
// "0 %", weil das ein Ergebnis behauptete, wo gar nichts gemessen wurde.
export default function KennzahlKachel({
  wert,
  beschriftung,
  hinweis,
  anteilVon,
}: {
  wert: number;
  beschriftung: string;
  hinweis: string;
  anteilVon?: number;
}) {
  const quote = anteilVon === undefined ? null : anteil(wert, anteilVon);

  return (
    <Card surface className="flex flex-col gap-0.5 p-3 sm:p-4">
      {/* tabular-nums, damit drei Kacheln nebeneinander nicht bei jeder
          Zahl unterschiedlich breit wirken. */}
      <p className="text-2xl font-semibold tabular-nums sm:text-3xl">
        {wert.toLocaleString("de-CH")}
      </p>
      <p className="text-sm font-medium">{beschriftung}</p>
      <p className="text-xs text-muted">
        {hinweis}
        {quote !== null && (
          <>
            {" · "}
            {/* Komma statt Punkt: die Oberfläche ist deutschsprachig. */}
            <span className="tabular-nums">
              {String(quote).replace(".", ",")} %
            </span>
          </>
        )}
      </p>
    </Card>
  );
}
