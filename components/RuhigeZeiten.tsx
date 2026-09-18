import SectionHeading from "@/components/ui/SectionHeading";
import { ChartIcon } from "@/components/NavIcons";
import { cn } from "@/lib/utils/cn";
import {
  baueHeatmap,
  fensterText,
  istFlach,
  ruhigstesFenster,
  startzeitenSatz,
  stufeFuerFaktor,
  STUFEN_LABEL,
  vollsteStunde,
  WOCHENTAG_KURZ,
  WOCHENTAG_LANG,
  type Startzeit,
  type VerkehrsPunkt,
  type VerkehrsStufe,
} from "@/lib/ruhigeZeiten";

// Wann es auf dieser Strecke ruhig ist.
//
// Die Woche als Raster, sieben Zeilen mal Stunden — dieselbe Form, in der man
// einen Fahrplan liest. Bewusst keine Kurve: eine Linie über 98 Punkte
// suggeriert eine Genauigkeit, die eine Vorhersage nicht hat, und beantwortet
// die eigentliche Frage ("wann fahre ich los?") schlechter als ein Raster, in
// dem man die eigene Zeile sucht.

const STUFEN_FLAECHE: Record<VerkehrsStufe, string> = {
  // Eine Rampe statt fünf Farben: je voller, desto mehr Rot. Ruhig ist
  // bewusst kein Grün — "hier ist frei" ist der Normalfall einer
  // Passstrasse und braucht kein Lob.
  ruhig: "bg-surface",
  normal: "bg-[color-mix(in_oklch,var(--color-warning)_20%,var(--color-surface))]",
  dicht: "bg-[color-mix(in_oklch,var(--color-warning)_55%,var(--color-surface))]",
  zaeh: "bg-[color-mix(in_oklch,var(--color-danger)_65%,var(--color-surface))]",
};

function Legende() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {(Object.keys(STUFEN_LABEL) as VerkehrsStufe[]).map((stufe) => (
        <li key={stufe} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden="true"
            className={cn("h-3 w-3 rounded-sm border border-border", STUFEN_FLAECHE[stufe])}
          />
          {STUFEN_LABEL[stufe]}
        </li>
      ))}
    </ul>
  );
}

export default function RuhigeZeiten({
  punkte,
  startzeiten,
  berechnetAm,
}: {
  punkte: VerkehrsPunkt[];
  startzeiten: Startzeit[];
  berechnetAm: string | null;
}) {
  const karte = baueHeatmap(punkte);
  const gemeinschaft = startzeitenSatz(startzeiten);

  // Ohne Profil bleibt höchstens der Satz aus den eigenen Fahrten — und ohne
  // den auch der nicht. Dann fehlt der Abschnitt ganz.
  if (!karte) {
    if (!gemeinschaft) return null;
    return (
      <section className="flex flex-col gap-2">
        <SectionHeading icon={ChartIcon}>Ruhige Zeiten</SectionHeading>
        <p className="text-sm text-muted">{gemeinschaft}</p>
      </section>
    );
  }

  const flach = istFlach(punkte);
  const fenster = ruhigstesFenster(punkte);
  const voll = vollsteStunde(punkte);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading icon={ChartIcon}>Ruhige Zeiten</SectionHeading>

      <p className="text-sm">
        {flach ? (
          <>Über die Woche kaum Unterschiede — hier ist selten etwas los.</>
        ) : (
          fenster && (
            <>
              Am ruhigsten <span className="font-medium">{fensterText(fenster)}</span>.
              {voll && stufeFuerFaktor(voll.faktor) !== "ruhig" && (
                <span className="text-muted">
                  {" "}
                  Am vollsten {WOCHENTAG_LANG[voll.wochentag - 1]} um {voll.stunde} Uhr.
                </span>
              )}
            </>
          )
        )}
      </p>

      <div className="flex flex-col gap-1.5">
        {/* Stundenachse: nur jede zweite Stunde beschriftet, sonst stehen auf
            dem Telefon vierzehn zweistellige Zahlen nebeneinander. */}
        <div className="flex gap-0.5 pl-8">
          {karte.stunden.map((stunde, i) => (
            <span
              key={stunde}
              className="flex-1 text-center font-mono text-[10px] text-muted"
              aria-hidden="true"
            >
              {i % 2 === 0 ? stunde : ""}
            </span>
          ))}
        </div>

        {karte.zeilen.map((zeile) => (
          <div key={zeile.wochentag} className="flex items-center gap-0.5">
            <span className="w-8 shrink-0 font-mono text-[11px] text-muted" aria-hidden="true">
              {WOCHENTAG_KURZ[zeile.wochentag - 1]}
            </span>
            {zeile.werte.map((faktor, i) => {
              const stunde = karte.stunden[i];
              if (faktor === null) {
                return (
                  <span
                    key={stunde}
                    aria-hidden="true"
                    className="h-6 flex-1 rounded-sm border border-dashed border-border"
                  />
                );
              }
              const stufe = stufeFuerFaktor(faktor);
              return (
                <span
                  key={stunde}
                  className={cn("h-6 flex-1 rounded-sm", STUFEN_FLAECHE[stufe])}
                  title={`${WOCHENTAG_LANG[zeile.wochentag - 1]}, ${stunde} Uhr: ${STUFEN_LABEL[stufe]}`}
                >
                  {/* Die Farbe allein trägt die Aussage nicht — jede Zelle
                      sagt sie auch als Text, für Vorlesesoftware und für
                      alle, die Rot und Gelb nicht unterscheiden. */}
                  <span className="sr-only">
                    {WOCHENTAG_LANG[zeile.wochentag - 1]}, {stunde} Uhr: {STUFEN_LABEL[stufe]}
                  </span>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <Legende />

      {gemeinschaft && <p className="text-sm text-muted">{gemeinschaft}</p>}

      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
        Verkehrsvorhersage Mapbox
        {berechnetAm &&
          ` · Stand ${new Intl.DateTimeFormat("de-CH", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "Europe/Zurich",
          }).format(new Date(berechnetAm))}`}
      </p>
    </section>
  );
}
