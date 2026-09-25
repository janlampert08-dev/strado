"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import { PassStatusMarke } from "@/components/PassStatusZeile";
import { HakenIcon } from "@/components/NavIcons";
import { anzeigeFuerStatus, type PassZustand } from "@/lib/passStatus";
import { hatStempelSpalte } from "@/lib/passStempel";
import { cn } from "@/lib/utils/cn";

// Die Liste aller Pässe mit Filtern. Client, weil die Filter sofort greifen
// sollen — 34 Zeilen brauchen keinen Serverbesuch, um sich zu sortieren.

export interface PassEintrag {
  id: string;
  name: string;
  hoeheM: number;
  kantone: string[];
  hochalpin: boolean;
  status: {
    zustand: PassZustand;
    meldung: string | null;
    quelle: "feed" | "moderation";
    aktualisiertAm: string;
    manuellBis: string | null;
  } | null;
  strecke: { id: string; name: string } | null;
  gefahren: { erstmals: string; fahrten: number } | null;
  folgtMan: boolean;
}

type Auswahl = "alle" | "hochalpin" | "offen" | "fehlen" | "gefolgt";

export default function PaesseListe({
  eintraege,
  feedStand,
  angemeldet,
}: {
  eintraege: PassEintrag[];
  feedStand: string | null;
  angemeldet: boolean;
}) {
  const [auswahl, setzeAuswahl] = useState<Auswahl>("alle");
  const [kanton, setzeKanton] = useState<string>("");

  const kantone = useMemo(
    () => [...new Set(eintraege.flatMap((e) => e.kantone))].sort(),
    [eintraege],
  );

  const gezeigt = useMemo(() => {
    const anzeigen = eintraege.map((eintrag) => ({
      eintrag,
      anzeige: anzeigeFuerStatus(eintrag.status, feedStand),
    }));

    return anzeigen.filter(({ eintrag, anzeige }) => {
      if (kanton && !eintrag.kantone.includes(kanton)) return false;
      if (auswahl === "hochalpin") return eintrag.hochalpin;
      if (auswahl === "offen") return anzeige.zustand === "offen";
      if (auswahl === "fehlen") return eintrag.gefahren === null;
      if (auswahl === "gefolgt") return eintrag.folgtMan;
      return true;
    });
  }, [eintraege, feedStand, auswahl, kanton]);

  // Die Stempelspalte nur mit Sammlung (lib/passStempel.ts).
  const stempelSpalte = hatStempelSpalte(angemeldet, eintraege);

  const filter: { wert: Auswahl; label: string }[] = [
    { wert: "alle", label: "Alle" },
    { wert: "hochalpin", label: "Hochalpin" },
    { wert: "offen", label: "Offen" },
    ...(angemeldet ? [{ wert: "fehlen" as const, label: "Nicht befahren" }] : []),
    ...(angemeldet ? [{ wert: "gefolgt" as const, label: "Gefolgt" }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Eine Filterzeile statt zwei: Segmente scrollen, Kanton als
          kompakter Select daneben — keine beschriftete Zweitzeile. */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto reiter-scroller">
          <SegmentedControl
            label="Pässe filtern"
            wert={auswahl}
            onChange={setzeAuswahl}
            segmente={filter.map((f) => ({ wert: f.wert, label: f.label }))}
          />
        </div>

        <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
          <span className="sr-only">Kanton</span>
          {/* Das Feld der App statt eines eigenen <select>: Rahmen in
              border-border-control wie jedes Feld und 16 px Schrift unter md,
              sonst zoomt iOS beim Antippen in die Seite. rounded-full und
              w-auto bleiben von vorher, weil es als Filter in der Reihe der
              Pillen steht und nicht als Formularfeld die Zeile füllt — seit
              cn tailwind-merge ist, setzen sie sich gegen die Vorgabe durch. */}
          <Select
            value={kanton}
            onChange={(e) => setzeKanton(e.target.value)}
            aria-label="Nach Kanton filtern"
            className="w-auto rounded-full text-foreground"
          >
            <option value="">CH</option>
            {kantone.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {gezeigt.length === 0 ? (
        <p className="text-sm text-muted">
          Zu dieser Auswahl gibt es keinen Pass. Nimm einen Filter weg.
        </p>
      ) : (
        <Card as="ul" className="divide-y divide-border">
          {gezeigt.map(({ eintrag, anzeige }) => (
            <li
              key={eintrag.id}
              // Die id bleibt: alte Links auf /paesse#susten springen weiter
              // an die richtige Zeile, auch seit jeder Pass eine eigene
              // Seite hat.
              id={eintrag.id}
              // relative + after:inset-0 am Link: die ganze Zeile ist die
              // Tippfläche, nicht nur der 21 px hohe Name (Audit 2026-09-23).
              className="druckbar relative flex items-center gap-3 px-4 py-3"
            >
              {/* Der Stempel steht nur, wo es etwas zu stempeln gibt. Bis
                  2026-09-25 trug JEDE Zeile einen Kreis — gestrichelt für
                  "noch nicht befahren" —, auf einem frischen Konto also 34
                  Mal dieselbe Leermeldung, und für Gäste, die gar keine
                  Sammlung haben, ebenso. Was fehlt, sagt der Zähler oben
                  ("0 von 34 befahren") und der Filter "Nicht befahren";
                  die Zeile selbst meldet nur noch, was man hat.

                  Die Spalte bleibt, sobald mindestens ein Pass gestempelt
                  ist: die ungestempelten Zeilen halten dann einen leeren
                  Platz gleicher Breite, damit die Namen untereinander
                  fluchten. Ohne einen einzigen Stempel (und immer für Gäste)
                  fällt die Spalte ganz weg. */}
              {stempelSpalte &&
                (eintrag.gefahren ? (
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent bg-accent-subtle text-accent-ink"
                    title={befahrenTitel(eintrag.gefahren.fahrten)}
                  >
                    <HakenIcon className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Befahren</span>
                  </span>
                ) : (
                  <span className="h-7 w-7 shrink-0" aria-hidden="true" />
                ))}

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {/* Auf die Passseite, auch wenn es eine Strecke gibt: dort
                      stehen Status, Saison und die Strecke selbst. Vorher
                      führte die Zeile auf die Strecke und war ohne Strecke
                      gar kein Link. */}
                  <Link
                    href={`/paesse/${eintrag.id}`}
                    className="hover:text-accent-ink after:absolute after:inset-0 after:content-['']"
                  >
                    {eintrag.name}
                  </Link>
                </p>
                <p className="truncate text-xs text-muted">
                  {eintrag.hoeheM.toLocaleString("de-CH")} m · {eintrag.kantone.join(" / ")}
                  {!eintrag.strecke && " · noch keine Strecke"}
                </p>
              </div>

              <PassStatusMarke anzeige={anzeige} className="shrink-0" />
            </li>
          ))}
        </Card>
      )}
    </div>
  );
}

function befahrenTitel(fahrten: number): string {
  return fahrten === 1 ? "Befahren" : `Befahren, ${fahrten} Fahrten`;
}
