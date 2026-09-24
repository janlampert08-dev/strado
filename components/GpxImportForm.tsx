"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { importGpxRide } from "@/lib/actions/completions";
import { gpxLesen, MAX_GPX_BYTES, MAX_GPX_DATEIEN, type GpxFahrt } from "@/lib/gpxImport";
import { datumCH, formatDuration, formatKm } from "@/lib/format";
import Button, { buttonVariants } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ImportIcon } from "@/components/NavIcons";

// Der Server lässt zwischen zwei Fahrten desselben Kontos fünf Sekunden
// verstreichen (COMPLETION_COOLDOWN_MS, Trigger aus 0024). Etwas mehr, damit
// die zweite Anfrage nicht knapp davor ankommt.
const ABSTAND_MS = 5500;

type Status = "bereit" | "laeuft" | "fertig" | "fehler" | "doppelt";

interface Eintrag {
  schluessel: string;
  datei: string;
  fahrt: GpxFahrt | null;
  status: Status;
  meldung: string | null;
  completionId: string | null;
}

function warte(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Liest die Dateien im Browser (lib/gpxImport.ts) und schickt je Fahrt nur
// die Punktliste — dieselbe Form wie der Recorder. Der Server prüft sie mit
// denselben Regeln wie eine Aufzeichnung (importGpxRide).
export default function GpxImportForm() {
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const eingabeRef = useRef<HTMLInputElement>(null);

  async function dateienGewaehlt(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    setHinweis(null);
    const dateien = Array.from(liste).slice(0, MAX_GPX_DATEIEN);
    if (liste.length > MAX_GPX_DATEIEN) {
      setHinweis(`Höchstens ${MAX_GPX_DATEIEN} Dateien auf einmal — die übrigen sind nicht dabei.`);
    }

    const neu: Eintrag[] = [];
    for (const datei of dateien) {
      const basis = { datei: datei.name, completionId: null };
      if (datei.size > MAX_GPX_BYTES) {
        neu.push({ ...basis, schluessel: `${datei.name}-gross`, fahrt: null, status: "fehler", meldung: "Die Datei ist zu gross." });
        continue;
      }
      const ergebnis = gpxLesen(await datei.text());
      if ("fehler" in ergebnis) {
        neu.push({ ...basis, schluessel: `${datei.name}-fehler`, fahrt: null, status: "fehler", meldung: ergebnis.fehler });
        continue;
      }
      ergebnis.fahrten.forEach((fahrt, i) =>
        neu.push({
          ...basis,
          schluessel: `${datei.name}-${fahrt.startMs}-${i}`,
          fahrt,
          status: "bereit",
          meldung: null,
        }),
      );
    }
    setEintraege(neu);
  }

  function aktualisiere(schluessel: string, aenderung: Partial<Eintrag>) {
    setEintraege((alt) => alt.map((e) => (e.schluessel === schluessel ? { ...e, ...aenderung } : e)));
  }

  async function importieren() {
    setLaeuft(true);
    let erste = true;
    for (const eintrag of eintraege) {
      if (eintrag.status !== "bereit" || !eintrag.fahrt) continue;
      if (!erste) await warte(ABSTAND_MS);
      erste = false;
      aktualisiere(eintrag.schluessel, { status: "laeuft" });

      const formData = new FormData();
      formData.set("trail", JSON.stringify(eintrag.fahrt.punkte));
      if (eintrag.fahrt.name) formData.set("titel", eintrag.fahrt.name);

      let ergebnis = await importGpxRide(formData);
      // Einmal nachfassen, falls der Cooldown doch noch griff (etwa weil
      // gerade eine Aufzeichnung gespeichert wurde).
      if (ergebnis.error?.startsWith("Bitte warte")) {
        await warte(ABSTAND_MS);
        ergebnis = await importGpxRide(formData);
      }

      if (!ergebnis.error) {
        aktualisiere(eintrag.schluessel, { status: "fertig", completionId: ergebnis.completionId ?? null });
      } else if (ergebnis.completionId) {
        aktualisiere(eintrag.schluessel, {
          status: "doppelt",
          meldung: ergebnis.error,
          completionId: ergebnis.completionId,
        });
      } else {
        aktualisiere(eintrag.schluessel, { status: "fehler", meldung: ergebnis.error });
      }
    }
    setLaeuft(false);
  }

  const bereit = eintraege.filter((e) => e.status === "bereit").length;
  const fertig = eintraege.filter((e) => e.status === "fertig").length;
  const fertigMitLauf = !laeuft && fertig > 0 && bereit === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Frühere Fahrten importieren</h1>
        <p className="text-sm text-muted">
          Lade GPX-Dateien aus calimoto, Kurviger, Strava oder von deinem Garmin hoch. Die Fahrten
          zählen für deine Geschichte und deine Pass-Sammlung — mit dem Datum, an dem du sie gefahren
          bist.
        </p>
        <p className="text-sm text-muted">
          Importierte Fahrten bleiben privat und erscheinen in keiner Rangliste: ihre Zeiten stammen
          aus einer Datei, nicht aus einer Aufzeichnung in Strado.
        </p>
      </div>

      <input
        ref={eingabeRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        multiple
        className="sr-only"
        onChange={(e) => {
          void dateienGewaehlt(e.target.files);
          e.target.value = "";
        }}
        disabled={laeuft}
        aria-label="GPX-Dateien wählen"
      />

      {eintraege.length === 0 ? (
        <Button
          type="button"
          variant="accent"
          size="lg"
          className="w-full"
          onClick={() => eingabeRef.current?.click()}
        >
          <ImportIcon className="h-5 w-5" aria-hidden="true" />
          GPX-Dateien wählen
        </Button>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {eintraege.map((e) => (
              <li key={e.schluessel}>
                <Card className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {e.fahrt?.name ?? e.datei}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {e.status === "laeuft" && "Wird importiert …"}
                      {e.status === "fertig" && "Importiert"}
                      {e.status === "doppelt" && "Schon da"}
                      {e.status === "fehler" && "Nicht importiert"}
                    </span>
                  </div>
                  {e.fahrt && (
                    <span className="text-xs text-muted tabular-nums">
                      {datumCH(new Date(e.fahrt.startMs))} · {formatKm(e.fahrt.distanzKm)} km ·{" "}
                      {formatDuration(e.fahrt.dauerSekunden)}
                    </span>
                  )}
                  {e.meldung && e.status !== "doppelt" && (
                    <span className="text-xs text-danger">{e.meldung}</span>
                  )}
                  {e.completionId && (e.status === "fertig" || e.status === "doppelt") && (
                    <Link href={`/fahrten/${e.completionId}`} className="text-xs text-accent">
                      Fahrt ansehen
                    </Link>
                  )}
                </Card>
              </li>
            ))}
          </ul>

          {fertigMitLauf ? (
            <Link href="/profil" className={buttonVariants({ variant: "accent", size: "lg", className: "w-full" })}>
              Zum Profil
            </Link>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="accent"
                size="lg"
                className="w-full"
                disabled={laeuft || bereit === 0}
                onClick={() => void importieren()}
              >
                {laeuft
                  ? "Importiere …"
                  : bereit === 1
                    ? "1 Fahrt importieren"
                    : `${bereit} Fahrten importieren`}
              </Button>
              {!laeuft && (
                <Button type="button" variant="ghost" onClick={() => setEintraege([])}>
                  Andere Dateien wählen
                </Button>
              )}
            </div>
          )}
          {laeuft && bereit > 1 && (
            <p className="text-center text-xs text-muted">
              Eine Fahrt alle paar Sekunden — lass die Seite offen, bis alle durch sind.
            </p>
          )}
        </>
      )}

      {hinweis && <p className="text-sm text-muted">{hinweis}</p>}
    </div>
  );
}
