"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import useEingabenBewahren from "@/components/useEingabenBewahren";
import Button from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { PassStatusMarke } from "@/components/PassStatusZeile";
import {
  gibPassStatusFrei,
  legeSperrtagAn,
  loescheSperrtag,
  setzePassStatus,
  type PassStatusState,
  type SperrtagState,
} from "@/lib/actions/paesse";
import { anzeigeFuerStatus, seitWann, type PassZustand } from "@/lib/passStatus";
import { ART_LABEL, formatiereZeitraum, type SperrtagArt } from "@/lib/passKalender";

// Die Notbremse hinter dem Feed und der Eingang des Sperrkalenders.
//
// Zwei Werkzeuge, eine Stelle: was der Abgleich falsch oder gar nicht sieht,
// setzt hier jemand von Hand — und was ohnehin bekannt ist (autofreier Tag,
// Rennen, Bauarbeiten), trägt hier jemand ein, bevor es jemanden überrascht.

export interface ModerationsPass {
  id: string;
  name: string;
  status: {
    zustand: PassZustand;
    meldung: string | null;
    quelle: "feed" | "moderation";
    aktualisiertAm: string;
    manuellBis: string | null;
  } | null;
}

export interface ModerationsSperrtag {
  id: string;
  passId: string;
  passName: string;
  von: string;
  bis: string;
  art: SperrtagArt;
  titel: string;
}

const STATUS_START: PassStatusState = { error: null };
const SPERRTAG_START: SperrtagState = { error: null };

function PassWahl({ paesse, name }: { paesse: ModerationsPass[]; name: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      Pass
      <Select name={name} required>
        {paesse.map((pass) => (
          <option key={pass.id} value={pass.id}>
            {pass.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

export default function PassModeration({
  paesse,
  sperrtage,
  feedStand,
}: {
  paesse: ModerationsPass[];
  sperrtage: ModerationsSperrtag[];
  feedStand: string | null;
}) {
  const [statusState, statusAction, statusLaeuft] = useActionState(setzePassStatus, STATUS_START);
  const [sperrtagState, sperrtagAction, sperrtagLaeuft] = useActionState(
    legeSperrtagAn,
    SPERRTAG_START,
  );
  const [freigabeLaeuft, starteFreigabe] = useTransition();
  const [loeschenLaeuft, starteLoeschen] = useTransition();
  // "Freigeben" und "Entfernen" sind die beiden Knoepfe hier, die KEIN
  // Formular sind und deshalb auch keinen useActionState-Zustand haben.
  // Ihre Server Actions geben { ok } zurueck und koennen fehlschlagen —
  // abgelaufene Sitzung, entzogene Moderatorenrolle, RPC-Fehler. Die
  // Rueckgabe wurde bisher weggeworfen, und weil beide Knoepfe im Erfolgsfall
  // ohnehin nur die Liste neu zeichnen lassen, sah ein Fehlschlag exakt aus
  // wie ein noch nicht durchgelaufenes revalidatePath: nichts passiert.
  // Beim Entfernen ist das die teure Richtung — der Sperrtag bleibt stehen,
  // waehrend die Moderatorin annimmt, er sei weg.
  const [freigabeFehler, setzeFreigabeFehler] = useState<string | null>(null);
  const [loeschFehler, setzeLoeschFehler] = useState<string | null>(null);
  const [formular, setzeFormular] = useState<"status" | "sperrtag" | null>(null);
  // Beide Formulare geben bei einem Fehler nur { error } zurueck und bleiben
  // stehen — ohne den Haken leert React 19 dabei jedes Feld. Beim Sperrtag
  // sind das sechs Eingaben (Pass, Von, Bis, Art, Titel, Zeitfenster,
  // Quelle), nur weil jemand Von und Bis vertauscht hat.
  // Siehe components/useEingabenBewahren.ts.
  const statusFormRef = useRef<HTMLFormElement>(null);
  const sperrtagFormRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(statusFormRef);
  useEingabenBewahren(sperrtagFormRef);

  // Gezeigt wird, was von der Erwartung abweicht: alles, was nicht offen ist,
  // und alles, was gerade von Hand gesetzt ist. Die übrigen 30 Zeilen wären
  // eine Liste ohne Entscheidung.
  const auffaellig = paesse
    .map((pass) => ({ pass, anzeige: anzeigeFuerStatus(pass.status, feedStand) }))
    .filter(({ pass, anzeige }) => anzeige.zustand !== "offen" || pass.status?.quelle === "moderation");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {feedStand
          ? `Letzter Abgleich mit den ASTRA-Verkehrsmeldungen ${seitWann(feedStand)}.`
          : "Noch kein Abgleich mit den ASTRA-Verkehrsmeldungen gelaufen."}
      </p>

      {auffaellig.length > 0 && (
        <Card as="ul" className="divide-y divide-border">
          {auffaellig.map(({ pass, anzeige }) => (
            <li key={pass.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-medium">{pass.name}</span>
              <PassStatusMarke anzeige={anzeige} />
              {pass.status?.quelle === "moderation" && (
                <>
                  {/* Bis wann die Setzung gilt — ohne diese Angabe sieht ein
                      Moderator nicht, ob sie noch in Kraft ist oder der Feed
                      längst wieder schreibt. */}
                  <span className="text-xs text-muted">
                    {pass.status.manuellBis
                      ? new Date(pass.status.manuellBis) > new Date()
                        ? `von Hand bis ${new Intl.DateTimeFormat("de-CH", {
                            day: "2-digit",
                            month: "2-digit",
                            timeZone: "Europe/Zurich",
                          }).format(new Date(pass.status.manuellBis))}`
                        : "von Hand, abgelaufen"
                      : "von Hand"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={freigabeLaeuft}
                    onClick={() => {
                      setzeFreigabeFehler(null);
                      starteFreigabe(async () => {
                        const { ok } = await gibPassStatusFrei(pass.id);
                        if (!ok) {
                          setzeFreigabeFehler(
                            `„${pass.name}“ konnte nicht freigegeben werden. Seite neu laden und nochmals versuchen.`,
                          );
                        }
                      });
                    }}
                  >
                    Freigeben
                  </Button>
                </>
              )}
            </li>
          ))}
        </Card>
      )}
      {freigabeFehler && (
        <p role="alert" className="text-sm text-danger">
          {freigabeFehler}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setzeFormular(formular === "status" ? null : "status")}
          aria-expanded={formular === "status"}
        >
          Status von Hand setzen
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setzeFormular(formular === "sperrtag" ? null : "sperrtag")}
          aria-expanded={formular === "sperrtag"}
        >
          Sperrung eintragen
        </Button>
      </div>

      {formular === "status" && (
        <form ref={statusFormRef} action={statusAction}>
          <Card surface className="flex flex-col gap-3 p-4">
          <PassWahl paesse={paesse} name="pass_id" />

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Zustand
            <Select
              name="zustand"
              required
              defaultValue="gesperrt"
            >
              <option value="offen">Offen</option>
              <option value="eingeschraenkt">Eingeschränkt</option>
              <option value="gesperrt">Gesperrt</option>
              <option value="wintersperre">Wintersperre</option>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Meldung (optional)
            <Textarea name="meldung" rows={2} maxLength={500} placeholder="Felssturz, Strasse gesperrt" />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Gilt für … Tage
            <Input name="tage" type="number" min={1} max={240} defaultValue={7} required />
            <span className="text-xs font-normal text-muted">
              Solange schreibt der Abgleich nicht darüber. Danach gilt wieder der Feed.
            </span>
          </label>

          {statusState.error && (
            <p role="alert" className="text-sm text-danger">
              {statusState.error}
            </p>
          )}
          {statusState.success && <p className="text-sm text-success">{statusState.success}</p>}

          <Button type="submit" size="sm" disabled={statusLaeuft}>
            {statusLaeuft ? "Wird gesetzt…" : "Status setzen"}
          </Button>
          </Card>
        </form>
      )}

      {formular === "sperrtag" && (
        <form ref={sperrtagFormRef} action={sperrtagAction}>
          <Card surface className="flex flex-col gap-3 p-4">
          <PassWahl paesse={paesse} name="pass_id" />

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              Von
              <Input name="von" type="date" required />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              Bis
              <Input name="bis" type="date" />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Art
            <Select
              name="art"
              required
              defaultValue="autofrei"
            >
              {(Object.keys(ART_LABEL) as SperrtagArt[]).map((art) => (
                <option key={art} value={art}>
                  {ART_LABEL[art]}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Titel
            <Input name="titel" required minLength={3} maxLength={120} placeholder="FreiPass Lukmanier" />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Zeitfenster (optional)
            <Input name="zeitfenster" maxLength={60} placeholder="11–16 Uhr" />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Quelle (optional)
            <Input name="quelle_url" type="url" placeholder="https://…" />
          </label>

          {sperrtagState.error && (
            <p role="alert" className="text-sm text-danger">
              {sperrtagState.error}
            </p>
          )}
          {sperrtagState.success && <p className="text-sm text-success">{sperrtagState.success}</p>}

          <Button type="submit" size="sm" disabled={sperrtagLaeuft}>
            {sperrtagLaeuft ? "Wird eingetragen…" : "Eintragen"}
          </Button>
          </Card>
        </form>
      )}

      {sperrtage.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Kommende Sperrungen
          </p>
          <Card as="ul" className="divide-y divide-border">
            {sperrtage.map((sperrtag) => (
              <li key={sperrtag.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{sperrtag.passName}</span> ·{" "}
                  {formatiereZeitraum(sperrtag.von, sperrtag.bis)} · {sperrtag.titel} (
                  {ART_LABEL[sperrtag.art]})
                </span>
                {/* Korrigiert wird durch Entfernen und neu Eintragen — es gibt
                    absichtlich kein Bearbeiten (0104). */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loeschenLaeuft}
                  onClick={() => {
                    setzeLoeschFehler(null);
                    starteLoeschen(async () => {
                      const { ok } = await loescheSperrtag(sperrtag.id);
                      if (!ok) {
                        setzeLoeschFehler(
                          `Die Sperrung „${sperrtag.titel}“ konnte nicht entfernt werden. Seite neu laden und nochmals versuchen.`,
                        );
                      }
                    });
                  }}
                >
                  Entfernen
                </Button>
              </li>
            ))}
          </Card>
        </div>
      )}
      {loeschFehler && (
        <p role="alert" className="text-sm text-danger">
          {loeschFehler}
        </p>
      )}
    </div>
  );
}
