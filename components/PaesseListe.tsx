"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { PassStatusMarke } from "@/components/PassStatusZeile";
import { HakenIcon } from "@/components/NavIcons";
import { anzeigeFuerStatus, type PassZustand } from "@/lib/passStatus";
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
}

type Auswahl = "alle" | "hochalpin" | "offen" | "fehlen";

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
      return true;
    });
  }, [eintraege, feedStand, auswahl, kanton]);

  const filter: { wert: Auswahl; label: string }[] = [
    { wert: "alle", label: "Alle" },
    { wert: "hochalpin", label: "Hochalpin" },
    { wert: "offen", label: "Offen" },
    ...(angemeldet ? [{ wert: "fehlen" as const, label: "Fehlt mir" }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <SegmentedControl
          label="Auswahl"
          wert={auswahl}
          onChange={setzeAuswahl}
          segmente={filter.map((f) => ({ wert: f.wert, label: f.label }))}
        />

        <label className="flex items-center gap-2 text-sm text-muted">
          Kanton
          <select
            value={kanton}
            onChange={(e) => setzeKanton(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">alle</option>
            {kantone.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      {gezeigt.length === 0 ? (
        <p className="text-sm text-muted">
          Zu dieser Auswahl gibt es keinen Pass. Nimm einen Filter weg.
        </p>
      ) : (
        <Card as="ul" className="divide-y divide-border">
          {gezeigt.map(({ eintrag, anzeige }) => (
            <li key={eintrag.id} id={eintrag.id} className="flex items-center gap-3 px-4 py-3">
              {/* Der Stempel: befahren oder nicht. Er steht vorn, weil die
                  Sammlung die Frage ist, mit der man diese Liste liest. */}
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                  eintrag.gefahren
                    ? "border-accent bg-accent-subtle text-accent"
                    : "border-dashed border-border text-muted",
                )}
              >
                {eintrag.gefahren ? (
                  <HakenIcon className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <span className="sr-only">Noch nicht befahren</span>
                )}
                {eintrag.gefahren && <span className="sr-only">Befahren</span>}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {eintrag.strecke ? (
                    <Link href={`/strecken/${eintrag.strecke.id}`} className="hover:text-accent">
                      {eintrag.name}
                    </Link>
                  ) : (
                    eintrag.name
                  )}
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
