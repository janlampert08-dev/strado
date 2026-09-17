"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { saisonDateiname, type SaisonFormat } from "@/lib/saisonLayout";
import { istSaisonLeer, type Saison } from "@/lib/saisonrueckblick";
import { mitAnzahl } from "@/lib/format";

// Der eine Knopf, der aus der Pass-Sammlung ein Bild macht.
//
// Die Zahlen kommen fertig vom Server (components/PassSammlung.tsx) — anders
// als beim Fahrten-Bild (ShareRideButton) muss hier nichts nachgeladen
// werden, es gibt keine Geometrie. Gezeichnet wird erst beim Tippen: die
// Canvas-Arbeit und das Laden der Schriften gehören nicht in den
// Seitenaufbau, und lib/saisonBild.ts wird deshalb dynamisch importiert.
//
// Teilen wie in ShareRideButton: natives Share-Sheet, wenn der Browser es
// für eine Datei kann, sonst Download. Die Stufen hier sind kürzer, weil das
// Bild auf keine einzelne Seite verweist — der Weg zurück steht auf dem Bild
// selbst (app.strado.ch in der Fusszeile).

type Zustand = "bereit" | "erstellt" | "fehler";

const FORMATE: { wert: SaisonFormat; label: string }[] = [
  { wert: "feed", label: "Feed 4:5" },
  { wert: "story", label: "Story 9:16" },
];

export default function SaisonrueckblickTeilen({ saison }: { saison: Saison | null }) {
  const [format, setFormat] = useState<SaisonFormat>("feed");
  const [zustand, setZustand] = useState<Zustand>("bereit");

  // Ein leeres Jahr erzeugt kein leeres Bild. Der Satz sagt, wann es eines
  // gibt, statt einen gesperrten Knopf ohne Grund hinzustellen.
  if (istSaisonLeer(saison)) {
    return (
      <p className="text-sm text-muted">
        Dein Saisonrückblick entsteht mit der ersten Fahrt des Jahres.
      </p>
    );
  }
  const s = saison!;

  async function teilen() {
    setZustand("erstellt");
    try {
      const { renderSaisonBild } = await import("@/lib/saisonBild");
      const blob = await renderSaisonBild(s, format);
      const dateiname = saisonDateiname(s.jahr, format);
      const titel = `Meine Saison ${s.jahr}`;
      const datei = new File([blob], dateiname, { type: "image/jpeg" });

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      const stufen: ShareData[] = [{ files: [datei], title: titel, text: titel }, { files: [datei] }];
      const nutzlast =
        typeof nav.share === "function" ? stufen.find((st) => nav.canShare?.(st)) : undefined;
      if (nutzlast) {
        try {
          await nav.share(nutzlast);
          setZustand("bereit");
          return;
        } catch (err) {
          // Abgebrochen ist kein Fehler und kein Grund für einen Download.
          if (err instanceof Error && err.name === "AbortError") {
            setZustand("bereit");
            return;
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dateiname;
      a.click();
      URL.revokeObjectURL(url);
      setZustand("bereit");
    } catch (err) {
      console.error("Saisonrückblick konnte nicht erstellt werden:", err);
      setZustand("fehler");
    }
  }

  const laeuft = zustand === "erstellt";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">Saisonrückblick {s.jahr}</h3>
        <p className="font-mono text-xs text-muted tabular-nums">
          {mitAnzahl(s.fahrten, "Fahrt", "Fahrten")}
          {s.paesse > 0 && ` · ${mitAnzahl(s.paesse, "Pass", "Pässe")}`}
          {` · ${s.km.toLocaleString("de-CH")} km`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="Bildformat"
          segmente={FORMATE}
          wert={format}
          onChange={setFormat}
        />
        <Button
          variant="secondary"
          onClick={teilen}
          disabled={laeuft}
          aria-busy={laeuft}
        >
          {laeuft && (
            <span
              aria-hidden="true"
              className="block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
            />
          )}
          {laeuft ? "Bild wird erstellt …" : "Saisonrückblick teilen"}
        </Button>
      </div>
      {/* role="status" statt alert: ein fehlgeschlagenes Bild ist ärgerlich,
          aber nichts, was eine Vorlesehilfe mitten im Satz unterbrechen
          muss. Die Region steht immer da, damit die Meldung angesagt wird,
          wenn sie erscheint. */}
      <p role="status" className="text-sm text-danger empty:hidden">
        {zustand === "fehler" ? "Das Bild liess sich nicht erstellen. Versuch es noch einmal." : ""}
      </p>
    </div>
  );
}
