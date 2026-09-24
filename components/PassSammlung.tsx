import Link from "next/link";
import { ChevronDown, PassIcon } from "@/components/NavIcons";
import PremiumHinweis from "@/components/PremiumHinweis";
import SaisonrueckblickTeilen from "@/components/SaisonrueckblickTeilen";
import { mitAnzahl, todayInZurich } from "@/lib/format";
import {
  baueSammlung,
  datumAnzeige,
  hoeheAnzeige,
  type PassFahrt,
  type PassStrecke,
} from "@/lib/passSammlung";
import { saisonAuswerten, waehleSaisonJahr } from "@/lib/saisonrueckblick";

// Die Pass-Sammlung auf der Profilseite: "deine Schweiz, Pass für Pass".
//
// Die Zahl "X von Y" gehört allen: sie steht für jedes Konto in der Kachel
// "Pässe befahren" (getSammlungsStand, 0104) und führt auf /paesse. Premium erzählt darüber hinaus — jeder Pass mit erster Fahrt und
// Anzahl, die offenen als Einladung, der Saisonrückblick als Bild. Beide
// lesen dieselbe Quelle (Katalog 0104, Fahrten über meine_passfahrten()
// aus 0113), damit nie zwei verschiedene Zahlen nebeneinanderstehen.
//
//   PassSammlungHinweis — ohne Abo. Nur der gemeinsame PremiumHinweis; die
//                         Zahl steht schon in der Kachel darüber.
//   PassSammlung        — mit Abo.
//
// Die Daten kommen von der Seite (lib/passSammlungDaten.ts, parallel zu den
// übrigen Abfragen). Keine Abfrage hier drin, kein N+1.

/** Die Form, in der die Profilseite ihre Fahrten ohnehin hat. */
interface ProfilFahrt {
  art: "strecke" | "frei";
  route_id: string | null;
  datum: string;
  distanz_km: number | null;
  hoehenmeter_aufstieg: number | null;
  routes: { name: string } | null;
}

export function PassSammlungHinweis() {
  return (
    <div className="flex flex-col gap-2 py-4">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <PassIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        Pass-Sammlung
      </p>
      <PremiumHinweis>
        Mit Premium siehst du jeden Pass mit deiner ersten Fahrt und teilst deine Saison als Bild
      </PremiumHinweis>
    </div>
  );
}

export default function PassSammlung({
  paesse,
  ladefehler,
  passFahrten,
  fahrten,
}: {
  paesse: readonly PassStrecke[];
  ladefehler: boolean;
  /** Die eigenen Passfahrten (meine_passfahrten, 0113). */
  passFahrten: readonly PassFahrt[];
  /** Die gezählten Fahrten der Seite, für den Saisonrückblick. */
  fahrten: readonly ProfilFahrt[];
}) {
  if (ladefehler) {
    return (
      <p className="text-sm text-muted">
        Die Pässe liessen sich gerade nicht laden. Lade die Seite neu, um es noch einmal zu
        versuchen.
      </p>
    );
  }

  if (paesse.length === 0) {
    return <p className="text-sm text-muted">Der Passkatalog ist gerade leer.</p>;
  }

  const sammlung = baueSammlung(paesse, passFahrten);

  // Die Saison aus denselben Fahrten wie die Auswertung darüber
  // (FahrtStatistik), damit km und Fahrten auf dem Bild mit "Nach Jahr"
  // übereinstimmen. Freie Fahrten zählen mit, tragen aber keine Strecke.
  const saisonFahrten = fahrten.map((f) => ({
    datum: f.datum,
    distanz_km: f.distanz_km,
    hoehenmeter_aufstieg: f.hoehenmeter_aufstieg,
    route_id: f.art === "strecke" ? f.route_id : null,
    streckenName: f.art === "strecke" ? (f.routes?.name ?? null) : null,
  }));
  const jahr = waehleSaisonJahr(
    saisonFahrten.map((f) => f.datum),
    todayInZurich(),
  );
  const saison = jahr === null ? null : saisonAuswerten(saisonFahrten, paesse, passFahrten, jahr);

  const { anzahlGefahren, anzahlGesamt, hoechsterPass } = sammlung;
  // Bis 40 Pässe ein Strich je Pass — "Pass für Pass" wörtlich genommen.
  // Darüber würden die Striche schmaler als eine Haarlinie, dann ein Balken.
  const alsStriche = anzahlGesamt <= 40;
  const anteil = anzahlGesamt === 0 ? 0 : (anzahlGefahren / anzahlGesamt) * 100;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {/* Die Zahl steht als Text da; der Fortschritt darunter wiederholt
            sie nur grafisch und ist deshalb aria-hidden. So hängt nichts an
            der Farbe allein. */}
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{anzahlGefahren}</span>
          <span className="text-sm text-muted">
            von <span className="tabular-nums">{anzahlGesamt}</span>{" "}
            {anzahlGesamt === 1 ? "Pass" : "Pässen"} gefahren
          </span>
        </p>
        {alsStriche ? (
          <div aria-hidden="true" className="flex h-1.5 gap-[2px]">
            {Array.from({ length: anzahlGesamt }, (_, i) => (
              <span
                key={i}
                // Die leere Spur als schwache Stufe desselben Akzents statt
                // in der Rahmenfarbe: so liest sich der Zustand über den
                // ganzen Strich, wie bei einem Füllstand.
                className={`flex-1 rounded-full ${i < anzahlGefahren ? "bg-accent" : "bg-accent/20"}`}
              />
            ))}
          </div>
        ) : (
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-accent/20">
            <div className="h-full rounded-full bg-accent" style={{ width: `${anteil}%` }} />
          </div>
        )}
        {hoechsterPass && hoechsterPass.hoehe_m !== null && (
          <p className="text-sm text-muted">
            Höchster Punkt:{" "}
            <span className="text-foreground">{hoechsterPass.name}</span>,{" "}
            <span className="tabular-nums">{hoeheAnzeige(hoechsterPass.hoehe_m)}</span>
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="pass-sammlung-gefahren">
        <h3 id="pass-sammlung-gefahren" className="text-sm font-medium">
          Gefahren
        </h3>
        {sammlung.gefahren.length === 0 ? (
          <p className="text-sm text-muted">
            Noch kein Pass in deiner Sammlung. Jeder Pass unten wartet auf deine erste Fahrt.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-border border-y border-border">
            {sammlung.gefahren.map((pass) => (
              <li key={pass.id}>
                <Link
                  // Ein Pass ist ein Katalogeintrag, keine Strecke: seine
                  // Seite (/paesse/<kürzel>) trägt Status, Saison und die
                  // Strecke, die darüber führt.
                  href={`/paesse/${pass.id}`}
                  // -mx-2/px-2: die Fläche für Hover und Fokus darf ein
                  // Stück über die Textkante hinausgehen, ohne die Flucht
                  // der Liste zum Seitenrand zu verlieren.
                  className="group -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 hover:bg-surface druckbar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-medium transition-colors duration-fast group-hover:text-accent-ink">
                        {pass.name}
                      </span>
                      {pass.region && (
                        <span className="shrink-0 text-xs text-muted">{pass.region}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      Erstmals {datumAnzeige(pass.ersteFahrt)} ·{" "}
                      {mitAnzahl(pass.anzahl, "Fahrt", "Fahrten")}
                    </span>
                  </span>
                  {pass.hoehe_m !== null && (
                    <span className="shrink-0 text-sm tabular-nums">
                      {hoeheAnzeige(pass.hoehe_m)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {sammlung.offen.length > 0 && (
        // Zugeklappt: der Katalog hat 34 Pässe, und am Anfang sind fast alle
        // offen — ausgeklappt stand eine Liste von 34 Zeilen mitten im Profil,
        // zwischen Auswertung und Saisonrückblick. Die Zahl steht im Titel.
        <details className="group flex flex-col gap-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span>
              Noch offen{" "}
              <span className="font-normal text-muted tabular-nums">{sammlung.offen.length}</span>
            </span>
            <ChevronDown
              className="h-4 w-4 text-muted transition-transform duration-fast group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          {/* Leiser als die gefahrenen: dieselbe Zeile, aber in der
              gedämpften Farbe und ohne Datumszeile. Eine Einladung, kein
              Vorwurf — deshalb auch kein "fehlt" und kein Schloss. */}
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {sammlung.offen.map((pass) => (
              <li key={pass.id}>
                <Link
                  href={`/paesse/${pass.id}`}
                  className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 text-muted hover:bg-surface druckbar hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate">{pass.name}</span>
                    {pass.region && <span className="shrink-0 text-xs">{pass.region}</span>}
                  </span>
                  {pass.hoehe_m !== null && (
                    <span className="shrink-0 text-sm tabular-nums">
                      {hoeheAnzeige(pass.hoehe_m)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="border-t border-border pt-5">
        <SaisonrueckblickTeilen saison={saison} />
      </div>
    </div>
  );
}
