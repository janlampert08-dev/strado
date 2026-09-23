import SectionHeading from "@/components/ui/SectionHeading";
import { ChartIcon } from "@/components/NavIcons";
import { cn } from "@/lib/utils/cn";
import {
  baueHeatmap,
  fasseGleicheTageZusammen,
  fensterText,
  ruhigstesFenster,
  skalaFuerPunkte,
  spitzeText,
  startzeitenSatz,
  stufeFuerFaktor,
  STUFEN_LABEL,
  STUFEN_REIHENFOLGE,
  tageText,
  tageTextLang,
  vollsteZeit,
  WERKTAGE,
  type Startzeit,
  type VerkehrsPunkt,
  type VerkehrsStufe,
} from "@/lib/ruhigeZeiten";

// Wann es auf dieser Strecke ruhig ist.
//
// Zuerst die Antwort als Satz ("Am ruhigsten: Sa–So 6–9 Uhr"), darunter die
// Woche als Raster — das Raster ist der Beleg, nicht die Aussage. Bis
// 2026-09-23 war es umgekehrt, und das Raster war ausserdem laut: eine Rampe
// von Orange nach Rot, wobei Rot überall sonst in der App "Fehler" heisst.
//
// Bewusst keine Kurve: eine Linie über 98 Punkte suggeriert eine Genauigkeit,
// die eine Vorhersage nicht hat, und beantwortet die eigentliche Frage ("wann
// fahre ich los?") schlechter als ein Raster, in dem man die eigene Zeile sucht.

// Eine einzige, neutrale Rampe: Vordergrund in die Hintergrundfarbe gemischt,
// mehr Tinte = voller. Kein Akzentblau, weil Blau in dieser App "antippbar"
// heisst, und kein Rot, weil es "Fehler" heisst. Dieselben Anteile tragen
// beide Modi, weil der Mischpartner mitwechselt: hell wird es dunkler, dunkel
// heller — "mehr" ist in beiden Fällen "mehr Kontrast zum Grund".
//
// Nachgerechnet (OKLab, WCAG-Kontrast), hell auf #fafafa / dunkel auf #0b0b0d:
//   10 %  #e0e0e0 / #1d1d1f   gegen Grund 1.26 / 1.17
//   25 %  #b9b9ba / #3b3b3d   gegen Vorstufe 1.49 / 1.51
//   42 %  #8f8f91 / #606063   gegen Vorstufe 1.65 / 1.78
//   65 %  #5a5a5c / #979799   gegen Vorstufe 2.13 / 2.15, gegen Grund 6.6 / 6.7
// Die Helligkeit steigt in beiden Modi streng monoton, benachbarte Stufen
// liegen mindestens 1.49:1 auseinander. Die unterste Stufe ist absichtlich
// kaum vom Grund zu unterscheiden: ruhig ist auf einer Passstrasse der
// Normalfall und braucht keine Farbe. Die Stufe steht ausserdem in jeder Zelle
// als Text (sr-only) — die Farbe trägt die Aussage nie allein.
const STUFEN_FLAECHE: Record<VerkehrsStufe, string> = {
  ruhig: "bg-[color-mix(in_oklch,var(--color-foreground)_10%,var(--color-background))]",
  normal: "bg-[color-mix(in_oklch,var(--color-foreground)_25%,var(--color-background))]",
  dicht: "bg-[color-mix(in_oklch,var(--color-foreground)_42%,var(--color-background))]",
  zaeh: "bg-[color-mix(in_oklch,var(--color-foreground)_65%,var(--color-background))]",
};

function Legende() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {STUFEN_REIHENFOLGE.map((stufe) => (
          <li key={stufe} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", STUFEN_FLAECHE[stufe])} />
            {STUFEN_LABEL[stufe]}
          </li>
        ))}
      </ul>
      <span>gemessen an der Woche dieser Strecke</span>
    </div>
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
  const rohKarte = baueHeatmap(punkte);
  const gemeinschaft = startzeitenSatz(startzeiten);

  // Ohne Profil bleibt höchstens der Satz aus den eigenen Fahrten — und ohne
  // den auch der nicht. Dann fehlt der Abschnitt ganz.
  if (!rohKarte) {
    if (!gemeinschaft) return null;
    return (
      <section className="flex flex-col gap-2">
        <SectionHeading icon={ChartIcon}>Ruhige Zeiten</SectionHeading>
        <p className="text-sm text-muted">{gemeinschaft}</p>
      </section>
    );
  }

  // Mapbox sagt Montag bis Freitag gleich voraus; fünf gleiche Zeilen
  // würden eine Auflösung behaupten, die es nicht gibt (GLEICH_TOLERANZ).
  const karte = fasseGleicheTageZusammen(rohKarte);
  const skala = skalaFuerPunkte(punkte);
  const fenster = skala.flach ? null : ruhigstesFenster(punkte);
  // Gewinnt das Wochenende, braucht es die Antwort für alle, die unter der
  // Woche fahren — sonst ist die Empfehlung für die meisten unbrauchbar.
  const werktags = fenster?.wochenende ? ruhigstesFenster(punkte, WERKTAGE) : null;
  const spitze = skala.flach ? null : vollsteZeit(punkte);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading icon={ChartIcon}>Ruhige Zeiten</SectionHeading>

      <div className="flex flex-col gap-1">
        {skala.flach || !fenster ? (
          <p className="text-base font-medium">
            Über die Woche kaum Unterschiede — hier ist selten etwas los.
          </p>
        ) : (
          <>
            <p className="text-base font-medium">Am ruhigsten: {fensterText(fenster)}</p>
            {(werktags || spitze) && (
              <p className="text-sm text-muted">
                {werktags && <>Unter der Woche: {fensterText(werktags)}. </>}
                {spitze && <>Am vollsten: {spitzeText(spitze)}.</>}
              </p>
            )}
          </>
        )}
      </div>

      {/* Das Raster als Tabelle: Vorlesesoftware bekommt Zeilen- und
          Spaltenköpfe und je Zelle die Stufe als Wort, ohne dass jede Zelle
          "Montag bis Freitag, 7 Uhr" wiederholen muss. Keine Schrift unter
          12 px: die Stundenachse beschriftet nur jede zweite Stunde, so
          passen zweistellige Zahlen auch auf 320 px Breite in ihre Spalte. */}
      <table className="w-full table-fixed border-separate border-spacing-0.5">
        <caption className="sr-only">
          Vorhergesagte Auslastung je Wochentag und Stunde, gemessen an der Woche dieser Strecke
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-11 p-0">
              <span className="sr-only">Tage</span>
            </th>
            {karte.stunden.map((stunde, i) => (
              <th
                key={stunde}
                scope="col"
                className="p-0 text-center text-xs font-normal tabular-nums text-muted"
              >
                {i % 2 === 0 ? (
                  <>
                    {stunde}
                    <span className="sr-only"> Uhr</span>
                  </>
                ) : (
                  <span className="sr-only">{stunde} Uhr</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {karte.zeilen.map((zeile) => (
            <tr key={zeile.wochentag}>
              <th
                scope="row"
                className="p-0 pr-1 text-left text-xs font-normal tabular-nums text-muted whitespace-nowrap"
              >
                <span aria-hidden="true">{tageText(zeile.tage)}</span>
                <span className="sr-only">{tageTextLang(zeile.tage)}</span>
              </th>
              {zeile.werte.map((faktor, i) => {
                const stunde = karte.stunden[i];
                if (faktor === null) {
                  return (
                    <td key={stunde} className="p-0">
                      <span className="block h-6 rounded-[3px] border border-dashed border-border" />
                      <span className="sr-only">keine Daten</span>
                    </td>
                  );
                }
                const stufe = stufeFuerFaktor(faktor, skala);
                return (
                  <td
                    key={stunde}
                    className="p-0"
                    title={`${tageTextLang(zeile.tage)}, ${stunde} Uhr: ${STUFEN_LABEL[stufe]}`}
                  >
                    <span className={cn("block h-6 rounded-[3px]", STUFEN_FLAECHE[stufe])} />
                    <span className="sr-only">{STUFEN_LABEL[stufe]}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {!skala.flach && <Legende />}

      {gemeinschaft && <p className="text-sm text-muted">{gemeinschaft}</p>}

      <p className="text-xs text-muted">
        Grundlage: vorhergesagte Fahrzeit (Mapbox), keine Verkehrszählung
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
