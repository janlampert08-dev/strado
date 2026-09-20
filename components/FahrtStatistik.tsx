import type { ReactNode } from "react";
import Card from "@/components/ui/Card";
import CountUp from "@/components/CountUp";
import Kennzahl, { Kennzahlen } from "@/components/ui/Kennzahl";
import { balkenHoehe } from "@/lib/balken";
import { mitAnzahl, todayInZurich } from "@/lib/format";
import {
  fahrtenProFahrzeug,
  fahrtenProJahr,
  fahrtenProRegion,
  jahrAus,
  monatAus,
  monatsWerte,
  rekorde,
  saisonVergleich,
  streckenBilanz,
  type FahrtFuerStatistik,
  type StatistikZeile,
} from "@/lib/fahrtstatistik";

// Die Premium-Auswertung auf der Profilseite: dieselben Fahrten wie die vier
// Kacheln darüber, aber nach Saison, Monat, Fahrzeug und Region
// aufgeschlüsselt.
//
// Additives Gating (docs/premium-plan.md, Abschnitt 4): Die vier
// Lebenszeit-Kacheln bleiben unverändert für jeden sichtbar. Dieser Block
// kommt obendrauf und nimmt nichts weg — er fügt die Dimensionen hinzu, die
// dort fehlen: die Zeit, das Fahrzeug und der Ort.
//
// Keine Dauer, kein Tempo, keine Bestzeit. Die Begründung steht im Kopf von
// lib/fahrtstatistik.ts: das eine offene Bein von Audit-Befund A1 ist genau
// dauer_sekunden, und AGB Ziff. 11.3 sagt, Strado sei kein Wettbewerb um
// Geschwindigkeit. „Bestwerte" weiter unten meint deshalb ausdrücklich die
// längste Fahrt und den grössten Anstieg, nie die schnellste Zeit.
//
// Der Aufbau folgt einer Reihenfolge, nicht dem Zufall: zuerst die Antwort
// auf „wie läuft meine Saison" (Kacheln), dann ihre Form über das Jahr
// (Kurve), dann die Aufteilung (Jahr, Fahrzeug, Region), zuletzt die
// Einzelstücke (Bestwerte). Wer nur die erste Zeile liest, hat das
// Wichtigste.

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

/** Wie viele Jahre die Saisonkurve nebeneinanderstellt. Drei Reihen sind
 *  auf einem 390-px-Schirm noch als eine Figur lesbar; ab der vierten
 *  wird aus dem Vergleich ein Archiv, und dafür gibt es die Jahrestabelle
 *  darunter. */
const KURVEN_JAHRE = 3;

/** Wie viele Regionen einzeln stehen. Der Rest wird zu einer Zeile
 *  zusammengefasst, statt die Liste mit Einzelfahrten zu füllen. */
const REGIONEN_EINZELN = 5;

interface FahrzeugName {
  id: string;
  marke: string;
  modell: string;
}

function zahl(wert: number): string {
  return wert.toLocaleString("de-CH");
}

/**
 * "YYYY-MM-DD" → "16.09.2026", ohne Umweg über Date. Derselbe Grund wie im
 * Kopf von lib/fahrtstatistik.ts: new Date("2026-01-01") ist Mitternacht
 * UTC und wird in jeder westlichen Zone als 31.12. angezeigt.
 */
function datumKurz(datum: string): string {
  const teile = datum.split("-");
  return teile.length === 3 ? `${teile[2]}.${teile[1]}.${teile[0]}` : datum;
}

/**
 * Der Vergleichstext unter einer Saison-Kachel. null, wenn es kein Vorjahr
 * gibt — dann steht in der Kachel bewusst nichts statt eines erfundenen
 * Nullvergleichs.
 */
function vergleichsText(
  aktuell: number,
  vorjahr: number | null,
  einheit: string,
  vorjahresJahr: number,
): ReactNode {
  if (vorjahr === null) return null;
  const differenz = Math.round((aktuell - vorjahr) * 10) / 10;
  if (differenz === 0) return `gleich wie ${vorjahresJahr}`;
  return (
    // Plus in Grün, Minus nur gedämpft: ein ruhigeres Jahr ist kein Fehler,
    // und --color-danger ist in dieser App die Farbe für „etwas ist kaputt".
    <span className={differenz > 0 ? "text-success" : undefined}>
      {differenz > 0 ? "+" : "−"}
      {zahl(Math.abs(differenz))}
      {einheit} ggü. {vorjahresJahr}
    </span>
  );
}

/**
 * Eine Zeile „Anteil an den Kilometern" — für Fahrzeuge und Regionen
 * dieselbe Form, weil beide dieselbe Frage beantworten: wie verteilt sich
 * das Jahr.
 *
 * Der Balken zeigt den EXAKTEN Anteil, ohne die Mindesthöhe aus
 * lib/balken.ts. Die gilt für Verlaufskurven, wo ein kleiner Wert sonst
 * unsichtbar wäre und keine Zahl danebensteht; hier steht die Prozentzahl
 * direkt daneben, und ein Balken auf 10 %, neben dem „1 %" steht,
 * widerspricht sich selbst.
 */
function AnteilZeile({
  name,
  zeile,
  gesamtKm,
}: {
  name: string;
  zeile: StatistikZeile;
  gesamtKm: number;
}) {
  const anteil = gesamtKm > 0 ? Math.round((zeile.km / gesamtKm) * 100) : 0;

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{name}</span>
        <span className="shrink-0 tabular-nums text-muted">{anteil} %</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
        <div
          // Inline, weil der Wert je Zeile anders ist: eine Tailwind-Klasse
          // pro möglicher Breite gibt es nicht, und arbitrary values liest
          // Tailwind zur Bauzeit aus dem Quelltext, nicht zur Laufzeit.
          // minWidth hält einen sehr kleinen Anteil sichtbar, ohne ihn
          // grösser zu behaupten, als er ist.
          className="h-full rounded-full bg-accent"
          style={{ width: `${anteil}%`, minWidth: zeile.km > 0 ? "2px" : "0" }}
        />
      </div>
      <p className="text-xs tabular-nums text-muted">
        {zahl(zeile.km)} km · {mitAnzahl(zeile.fahrten, "Fahrt", "Fahrten")} ·{" "}
        {zahl(zeile.hoehenmeter)} m
      </p>
    </li>
  );
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
        Sobald du deine erste Fahrt aufgezeichnet hast, steht hier deine Saison — nach Monaten,
        Fahrzeugen und Regionen aufgeschlüsselt, mit dem Vergleich zum Vorjahr.
      </p>
    );
  }

  const heute = todayInZurich();
  const heuteJahr = jahrAus(heute);
  const heuteMonat = monatAus(heute);

  const saison = saisonVergleich(fahrten, jahre[0].jahr, heute);
  const strecken = streckenBilanz(fahrten, saison.jahr);
  const bestwerte = rekorde(fahrten);

  const proFahrzeug = fahrtenProFahrzeug(fahrten);
  const proRegion = fahrtenProRegion(fahrten);
  const gesamtKm = jahre.reduce((summe, j) => summe + j.km, 0);

  // Die Kurve zeigt die jüngsten Jahre und skaliert sie auf EINEN
  // gemeinsamen Höchstwert. Pro Reihe zu skalieren wäre bequemer und
  // falsch: dann sähe eine Saison mit 300 km genauso aus wie eine mit
  // 3000, und der Vergleich, für den die Reihen überhaupt untereinander
  // stehen, wäre dahin.
  const kurve = jahre.slice(0, KURVEN_JAHRE).map((jahr) => ({
    jahr: jahr.jahr,
    summe: jahr,
    monate: monatsWerte(fahrten, jahr.jahr),
  }));
  const monatsSpitze = Math.max(...kurve.flatMap((reihe) => reihe.monate.map((m) => m.km)));

  const nameVon = new Map(fahrzeuge.map((f) => [f.id, `${f.marke} ${f.modell}`]));

  // Nur die grössten Regionen einzeln; der Rest wird eine Zeile. „Übrige"
  // steht dabei für echte Regionen, „Ohne Region" für die Fahrten, bei
  // denen das Reverse-Geocoding nichts geliefert hat — die beiden sind
  // nicht dasselbe und werden deshalb nicht zusammengeworfen.
  const regionenBenannt = proRegion.filter((r) => r.region !== null);
  const regionenOhne = proRegion.find((r) => r.region === null) ?? null;
  const regionenOben = regionenBenannt.slice(0, REGIONEN_EINZELN);
  const regionenRest = regionenBenannt.slice(REGIONEN_EINZELN);
  const regionenRestSumme = regionenRest.reduce<StatistikZeile>(
    (summe, r) => ({
      fahrten: summe.fahrten + r.fahrten,
      km: Math.round((summe.km + r.km) * 10) / 10,
      hoehenmeter: summe.hoehenmeter + r.hoehenmeter,
    }),
    { fahrten: 0, km: 0, hoehenmeter: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Saison {saison.jahr}
          {saison.laufend && <span className="ml-1.5 font-normal text-muted">bis heute</span>}
        </h3>
        <Kennzahlen>
          <Kennzahl
            beschriftung="Fahrten"
            wert={<CountUp value={saison.aktuell.fahrten} />}
            zusatz={vergleichsText(
              saison.aktuell.fahrten,
              saison.vorjahr?.fahrten ?? null,
              "",
              saison.jahr - 1,
            )}
          />
          <Kennzahl
            beschriftung="Kilometer"
            wert={<CountUp value={saison.aktuell.km} unit="km" />}
            zusatz={vergleichsText(
              saison.aktuell.km,
              saison.vorjahr?.km ?? null,
              " km",
              saison.jahr - 1,
            )}
          />
          <Kennzahl
            beschriftung="Höhenmeter"
            wert={<CountUp value={saison.aktuell.hoehenmeter} unit="m" />}
            zusatz={vergleichsText(
              saison.aktuell.hoehenmeter,
              saison.vorjahr?.hoehenmeter ?? null,
              " m",
              saison.jahr - 1,
            )}
          />
          <Kennzahl
            beschriftung="Neue Strecken"
            wert={<CountUp value={strecken.neuImJahr} />}
            zusatz={`${zahl(strecken.gesamt)} insgesamt`}
          />
        </Kennzahlen>
        {/* Der Satz, der den Vergleich erst ehrlich macht. Ohne ihn liest
            sich „+180 km ggü. 2025" im Februar wie eine Aussage über zwei
            volle Jahre — siehe Kopf von lib/fahrtstatistik.ts. */}
        <p className="text-xs text-muted">
          {saison.vorjahr === null
            ? // "Erste Saison" nur, wenn es wirklich die erste ist: eine Lücke
              // im Vorjahr (2024 gefahren, 2025 nicht) ist keine, und die
              // Tabelle darunter zeigt die älteren Jahre.
              jahre.length === 1
              ? `Deine erste Saison. Ab ${saison.jahr + 1} steht hier der Vergleich zum Vorjahr.`
              : `${saison.jahr - 1} ohne Fahrt — kein Vergleich zum Vorjahr möglich.`
            : saison.laufend
              ? `Verglichen wird derselbe Zeitraum: 1. Januar bis ${datumKurz(heute)}, in beiden Jahren.`
              : `${saison.jahr} ist abgeschlossen — verglichen werden die vollen Jahre.`}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Saisonkurve</h3>
        {monatsSpitze <= 0 ? (
          <p className="text-sm text-muted">
            Für die letzten Saisons sind keine Kilometer erfasst.
          </p>
        ) : (
          <>
            {/* Reine Auszeichnung, kein Diagramm-Paket: Balken, deren Höhe
                sich am stärksten Monat aller gezeigten Jahre bemisst. Die
                Zahlen stehen in aria-label, damit die Kurve nicht nur
                visuell existiert. */}
            <ul className="flex flex-col gap-3">
              {kurve.map((reihe) => (
                <li key={reihe.jahr} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-xs tabular-nums">
                    <span className="font-medium">{reihe.jahr}</span>
                    <span className="text-muted">
                      {zahl(reihe.summe.km)} km ·{" "}
                      {mitAnzahl(reihe.summe.fahrten, "Fahrt", "Fahrten")}
                    </span>
                  </div>
                  <ol
                    className="flex h-10 items-end gap-1"
                    aria-label={`Kilometer pro Monat ${reihe.jahr}`}
                  >
                    {reihe.monate.map((monat, index) => {
                      // Ein Monat, der in diesem Jahr noch gar nicht
                      // stattgefunden hat, ist etwas anderes als ein Monat
                      // ohne Fahrt. Sichtbar sind beide ein dünner Strich —
                      // sagen lässt sich der Unterschied nur im Label.
                      const stehtAus =
                        reihe.jahr === heuteJahr &&
                        heuteMonat !== null &&
                        index + 1 > heuteMonat;
                      // Einmal formuliert, zweimal ausgeliefert: als
                      // aria-label für Vorlesehilfen und als title für den
                      // Zeiger. Vorher stand der Wert nur im Label, womit
                      // ein Balken für alle sehenden Nutzer mit Maus eine
                      // Fläche ohne Zahl blieb — dieselbe Doppelung nutzt
                      // ActivityHeatmap.tsx schon.
                      const beschriftung = stehtAus
                        ? `${MONATE_LANG[index]} ${reihe.jahr}: steht noch aus`
                        : monat.km > 0
                          ? `${MONATE_LANG[index]} ${reihe.jahr}: ${zahl(monat.km)} km, ${mitAnzahl(monat.fahrten, "Fahrt", "Fahrten")}`
                          : `${MONATE_LANG[index]} ${reihe.jahr}: keine Fahrt`;
                      return (
                        <li
                          // aria-label auf dem <li> ERSETZT dessen Inhalt, es
                          // ergänzt ihn nicht. Ohne den Monat im Label selbst
                          // bliebe zwölfmal nur eine Zahl übrig, in einer
                          // Reihenfolge, die man raten müsste.
                          key={MONATSKUERZEL[index] + index}
                          className="flex min-w-0 flex-1 items-end self-stretch"
                          aria-label={beschriftung}
                          title={beschriftung}
                        >
                          <div
                            className={
                              monat.km > 0
                                ? "w-full rounded-sm bg-accent"
                                : "w-full rounded-sm bg-border"
                            }
                            style={{
                              height:
                                monat.km > 0
                                  ? `${balkenHoehe(monat.km, monatsSpitze)}%`
                                  : "2px",
                            }}
                          />
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ul>
            {/* Die Monatsbeschriftung einmal unter der untersten Reihe statt
                je Jahr: dasselbe flex-Raster (flex-1, gap-1) wie die Balken
                darüber, also sitzt jeder Buchstabe unter seiner Spalte. */}
            <ol aria-hidden="true" className="flex gap-1">
              {MONATSKUERZEL.map((kuerzel, index) => (
                <li
                  key={kuerzel + index}
                  className="min-w-0 flex-1 text-center text-[0.625rem] text-muted"
                >
                  {kuerzel}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted">
              Balkenhöhe = Kilometer im Monat, für alle gezeigten Jahre gleich skaliert.
            </p>
          </>
        )}
      </section>

      {/* Die Jahrestabelle erst ab dem zweiten Jahr: mit nur einem Jahr
          wiederholte sie Zeile für Zeile die Kacheln ganz oben. */}
      {jahre.length > 1 && (
        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium marker:content-none">
            Alle Jahre
            <span className="text-xs font-normal text-muted">{jahre.length} Saisons</span>
          </summary>
          <div className="px-3 pb-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Jahr
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    Fahrten
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    km
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Höhenmeter
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jahre.map((zeile) => (
                  <tr key={zeile.jahr}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium">
                      {zeile.jahr}
                    </th>
                    <td className="py-2 pr-3 text-right">{zahl(zeile.fahrten)}</td>
                    {/* Der Vorjahresvergleich stand bis hierher in dieser
                        Spalte und verglich ein angefangenes Jahr mit einem
                        vollen. Er sitzt jetzt oben in den Saison-Kacheln,
                        auf demselben Zeitfenster gerechnet. */}
                    <td className="py-2 pr-3 text-right">{zahl(zeile.km)}</td>
                    <td className="py-2 text-right">{zahl(zeile.hoehenmeter)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </details>
      )}

      <details className="group rounded-xl border border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium marker:content-none">
          Nach Fahrzeug
          <span className="text-xs font-normal text-muted">gesamt</span>
        </summary>
        <ul className="flex flex-col gap-3 px-3 pb-3">
          {proFahrzeug.map((zeile) => (
            <AnteilZeile
              key={zeile.fahrzeugId ?? "ohne-fahrzeug"}
              name={
                zeile.fahrzeugId === null
                  ? "Ohne Fahrzeug"
                  : (nameVon.get(zeile.fahrzeugId) ?? "Gelöschtes Fahrzeug")
              }
              zeile={zeile}
              gesamtKm={gesamtKm}
            />
          ))}
        </ul>
      </details>

      {/* Die Region beantwortet die Frage, die weder Jahr noch Fahrzeug
          beantwortet: wo war ich eigentlich. Der Abschnitt entfällt, solange
          zu keiner Fahrt eine Region bekannt ist — eine Liste, die nur
          „Ohne Region" enthält, sagt nichts. */}
      {regionenBenannt.length > 0 && (
        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium marker:content-none">
            Nach Region
            <span className="text-xs font-normal text-muted">gesamt</span>
          </summary>
          <ul className="flex flex-col gap-3 px-3 pb-3">
            {regionenOben.map((zeile) => (
              <AnteilZeile
                key={zeile.region ?? "ohne-region"}
                name={zeile.region ?? "Ohne Region"}
                zeile={zeile}
                gesamtKm={gesamtKm}
              />
            ))}
            {regionenRest.length > 0 && (
              <AnteilZeile
                // mitAnzahl statt Interpolation: bei genau sechs benannten
                // Regionen bleibt eine übrig, und „1 weitere Regionen" ist
                // derselbe Fehler, den lib/format.ts beschreibt — er stand
                // schon einmal live auf dem Teilen-Bild.
                name={mitAnzahl(regionenRest.length, "weitere Region", "weitere Regionen")}
                zeile={regionenRestSumme}
                gesamtKm={gesamtKm}
              />
            )}
            {regionenOhne !== null && (
              <AnteilZeile name="Ohne Region" zeile={regionenOhne} gesamtKm={gesamtKm} />
            )}
          </ul>
        </details>
      )}

      {/* Bestwerte, nicht Bestzeiten: längste Fahrt, grösster Anstieg,
          stärkster Monat. Eine schnellste Runde stünde hier nie — siehe
          Kopf dieser Datei. */}
      {(bestwerte.laengsteFahrt || bestwerte.hoechsterAnstieg || bestwerte.staerksterMonat) && (
        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium marker:content-none">
            Bestwerte
          </summary>
          <div className="px-3 pb-3">
          <Card as="dl" surface className="divide-y divide-border">
            {bestwerte.laengsteFahrt && (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <dt className="min-w-0 truncate text-muted">Längste Fahrt</dt>
                <dd className="shrink-0 tabular-nums">
                  {zahl(bestwerte.laengsteFahrt.wert)} km
                  <span className="ml-1.5 text-muted">
                    {datumKurz(bestwerte.laengsteFahrt.datum)}
                  </span>
                </dd>
              </div>
            )}
            {bestwerte.hoechsterAnstieg && (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <dt className="min-w-0 truncate text-muted">Grösster Anstieg</dt>
                <dd className="shrink-0 tabular-nums">
                  {zahl(bestwerte.hoechsterAnstieg.wert)} m
                  <span className="ml-1.5 text-muted">
                    {datumKurz(bestwerte.hoechsterAnstieg.datum)}
                  </span>
                </dd>
              </div>
            )}
            {bestwerte.staerksterMonat && (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <dt className="min-w-0 truncate text-muted">Stärkster Monat</dt>
                <dd className="shrink-0 tabular-nums">
                  {zahl(bestwerte.staerksterMonat.km)} km
                  <span className="ml-1.5 text-muted">
                    {MONATE_LANG[bestwerte.staerksterMonat.monat - 1]}{" "}
                    {bestwerte.staerksterMonat.jahr}
                  </span>
                </dd>
              </div>
            )}
          </Card>
          </div>
        </details>
      )}
    </div>
  );
}
