import {
  ART_LABEL,
  formatiereZeitraum,
  heuteCH,
  MONATSKUERZEL,
  MONATSNAMEN,
  oeffnungenAusEreignissen,
  saisonMonate,
  teileSperrtage,
  wintersperreText,
  type PassEreignis,
  type Sperrtag,
} from "@/lib/passKalender";
import { cn } from "@/lib/utils/cn";

// Der Kalender eines Passes: wann er üblicherweise offen ist, was als
// Nächstes ansteht, und wann er in den vergangenen Jahren tatsächlich
// aufging.
//
// Die drei Teile stehen bewusst in dieser Reihenfolge und fallen einzeln weg:
// ein ganzjährig offener Pass hat kein Saisonband, ein Pass ohne geplante
// Sperrung keine Liste, und im ersten Jahr gibt es keine Öffnungsdaten. Was
// bleibt, ist dann eben kürzer — nicht ein Platzhalter, der so tut, als wäre
// etwas da.

function Saisonband({
  ab,
  bis,
  heutigerMonat,
}: {
  ab: number | null;
  bis: number | null;
  heutigerMonat: number;
}) {
  const offen = saisonMonate(ab, bis);

  return (
    <div>
      <ol className="flex gap-0.5" aria-hidden="true">
        {offen.map((istOffen, i) => (
          <li
            key={i}
            className={cn(
              "flex h-7 flex-1 items-center justify-center rounded-sm text-[11px] tabular-nums",
              istOffen ? "bg-accent-subtle text-foreground" : "bg-surface text-muted",
              i + 1 === heutigerMonat && "ring-1 ring-accent",
            )}
          >
            {MONATSKUERZEL[i]}
          </li>
        ))}
      </ol>
      {/* Das Band ist für die Augen; gelesen wird der Satz. */}
      <p className="sr-only">
        Üblicherweise befahrbar:{" "}
        {offen
          .map((istOffen, i) => (istOffen ? MONATSNAMEN[i] : null))
          .filter(Boolean)
          .join(", ")}
        .
      </p>
    </div>
  );
}

export default function PassKalenderAbschnitt({
  wintersperreAbMonat,
  wintersperreBisMonat,
  sperrtage,
  ereignisse,
}: {
  wintersperreAbMonat: number | null;
  wintersperreBisMonat: number | null;
  sperrtage: Sperrtag[];
  ereignisse: PassEreignis[];
}) {
  const heute = heuteCH();
  const heutigerMonat = Number(heute.slice(5, 7));
  const { kommend, vergangen } = teileSperrtage(sperrtage, heute);
  const oeffnungen = oeffnungenAusEreignissen(ereignisse);
  const saisonText = wintersperreText(wintersperreAbMonat, wintersperreBisMonat);

  const letzteVergangene = vergangen.slice(0, 2);

  return (
    <div className="flex flex-col gap-4">
      {saisonText && (
        <div className="flex flex-col gap-2">
          <Saisonband ab={wintersperreAbMonat} bis={wintersperreBisMonat} heutigerMonat={heutigerMonat} />
          <p className="text-sm text-muted">{saisonText}. Die Monate sind Erfahrungswerte.</p>
        </div>
      )}

      {kommend.length > 0 && (
        <ul className="flex flex-col gap-2">
          {kommend.map((sperrtag) => (
            <li key={sperrtag.id} className="flex flex-col gap-0.5 border-l border-border-strong pl-3">
              <p className="text-sm font-medium">
                {formatiereZeitraum(sperrtag.von, sperrtag.bis)}
                {sperrtag.zeitfenster && <span className="text-muted"> · {sperrtag.zeitfenster}</span>}
              </p>
              <p className="text-sm text-muted">
                {sperrtag.titel} · {ART_LABEL[sperrtag.art]}
                {sperrtag.quelleUrl && (
                  <>
                    {" · "}
                    <a
                      href={sperrtag.quelleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Quelle
                    </a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {kommend.length === 0 && letzteVergangene.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Keine geplante Sperrung bekannt. Zuletzt war gesperrt:</p>
          <ul className="flex flex-col gap-1">
            {letzteVergangene.map((sperrtag) => (
              <li key={sperrtag.id} className="text-sm text-muted">
                {formatiereZeitraum(sperrtag.von, sperrtag.bis)} · {sperrtag.titel}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kommend.length === 0 && letzteVergangene.length === 0 && (
        <p className="text-sm text-muted">Keine geplante Sperrung bekannt.</p>
      )}

      {oeffnungen.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {oeffnungen.slice(0, 4).map((oeffnung) => (
            <div key={oeffnung.jahr} className="flex flex-col">
              <dt className="text-xs text-muted">
                Öffnung {oeffnung.jahr}
              </dt>
              <dd className="text-sm">{formatiereZeitraum(oeffnung.datum, oeffnung.datum)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
