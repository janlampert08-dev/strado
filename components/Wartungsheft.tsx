"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import useEingabenBewahren from "@/components/useEingabenBewahren";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Dialog, { ConfirmDialog } from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Textarea, fieldClassName } from "@/components/ui/Input";
import { WartungIcon } from "@/components/NavIcons";
import {
  addWartungseintrag,
  deleteWartungseintrag,
  updateWartungseintrag,
  type WartungFormState,
} from "@/lib/actions/wartung";
import {
  MAX_NOTIZ_LAENGE,
  WARTUNGSART_LABEL,
  artenFuer,
  datumText,
  kmText,
  type Wartungsart,
} from "@/lib/wartung";
import type { FahrzeugTyp, Wartungseintrag } from "@/types/database";

// Das Wartungsheft eines Fahrzeugs: Liste, Hinzufügen, Ändern, Löschen.
//
// Eine Client Component, weil drei Dialoge und eine Auswahlliste daran
// hängen. Die Regeln selbst stehen in lib/wartung.ts und in der Server
// Action — was hier passiert, ist Anzeige.
//
// darfSchreiben ist ausschliesslich Oberfläche: die Schranke sind die
// RLS-Policies aus 0111 und istPremium() in lib/actions/wartung.ts. Wer das
// Formular mit abgelaufenem Abo trotzdem abschickt, bekommt den Satz aus der
// Action, keine stille Ablehnung.

const LEERER_ZUSTAND: WartungFormState = { error: null };

function betragText(chf: number): string {
  return `CHF ${chf.toFixed(2)}`;
}

function Felder({
  fahrzeugTyp,
  heute,
  eintrag,
}: {
  fahrzeugTyp: FahrzeugTyp;
  heute: string;
  eintrag?: Wartungseintrag;
}) {
  // Die Art des bestehenden Eintrags bleibt wählbar, auch wenn sie für
  // diesen Fahrzeugtyp nicht mehr angeboten wird — sonst würde ein
  // Ändern-Dialog die gespeicherte Art stillschweigend überschreiben.
  const arten: Wartungsart[] = artenFuer(fahrzeugTyp);
  if (eintrag && !arten.includes(eintrag.art)) arten.unshift(eintrag.art);

  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Was wurde gemacht?
        <select name="art" required defaultValue={eintrag?.art ?? "service"} className={fieldClassName()}>
          {arten.map((art) => (
            <option key={art} value={art}>
              {WARTUNGSART_LABEL[art]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Datum
        <Input
          type="date"
          name="datum"
          required
          max={heute}
          defaultValue={eintrag?.datum ?? heute}
          className="tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Kilometerstand (optional)
        <Input
          type="text"
          name="km_stand"
          inputMode="numeric"
          defaultValue={eintrag?.km_stand?.toString() ?? ""}
          className="tabular-nums"
        />
        <span className="text-xs font-normal text-muted">
          Der Stand auf dem Zähler. Damit rechnet Strado bis zum nächsten Service weiter.
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Kosten in CHF (optional)
        <Input
          type="text"
          name="kosten_chf"
          inputMode="decimal"
          defaultValue={eintrag?.kosten_chf?.toString() ?? ""}
          className="tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Notiz (optional)
        <Textarea name="notiz" rows={3} maxLength={MAX_NOTIZ_LAENGE} defaultValue={eintrag?.notiz ?? ""} />
      </label>
    </>
  );
}

function EintragFormular({
  aktion,
  fahrzeugId,
  fahrzeugTyp,
  heute,
  eintrag,
  onFertig,
  onAbbrechen,
}: {
  aktion: (state: WartungFormState, formData: FormData) => Promise<WartungFormState>;
  fahrzeugId: string;
  fahrzeugTyp: FahrzeugTyp;
  heute: string;
  eintrag?: Wartungseintrag;
  onFertig: () => void;
  onAbbrechen: () => void;
}) {
  const [state, formAction, pending] = useActionState(aktion, LEERER_ZUSTAND);
  const formRef = useRef<HTMLFormElement>(null);
  // React 19 setzt das Formular nach jedem Lauf der Action zurück, auch nach
  // einem Fehlschlag — ohne diesen Haken wären alle Eingaben weg, sobald
  // eine Prüfung anschlägt (siehe components/useEingabenBewahren.ts).
  useEingabenBewahren(formRef);

  useEffect(() => {
    if (state.erfolg) onFertig();
  }, [state.erfolg, onFertig]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="fahrzeug_id" value={fahrzeugId} />
      {eintrag && <input type="hidden" name="id" value={eintrag.id} />}
      <Felder fahrzeugTyp={fahrzeugTyp} heute={heute} eintrag={eintrag} />
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onAbbrechen}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Speichern…" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}

export default function Wartungsheft({
  fahrzeugId,
  fahrzeugTyp,
  heute,
  eintraege,
  darfSchreiben,
}: {
  fahrzeugId: string;
  fahrzeugTyp: FahrzeugTyp;
  /** Kalendertag in Europe/Zurich, vom Server — als Vorgabe und Obergrenze
   *  des Datumsfelds. Der Browser könnte in einer anderen Zone stehen. */
  heute: string;
  eintraege: Wartungseintrag[];
  darfSchreiben: boolean;
}) {
  const [neuOffen, setNeuOffen] = useState(false);
  const [bearbeitet, setBearbeitet] = useState<Wartungseintrag | null>(null);
  const [zuLoeschen, setZuLoeschen] = useState<Wartungseintrag | null>(null);
  const [loeschFehler, setLoeschFehler] = useState<string | null>(null);
  // useTransition wie in DeleteVehicleButton: die Aktion revalidiert die
  // Seite, und der Übergang hält den Knopf bis dahin gesperrt — ohne ihn
  // wäre ein zweiter Klick ein zweiter Löschversuch.
  const [loeschLaeuft, startLoeschen] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {darfSchreiben && (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={() => setNeuOffen(true)}>
            Eintrag hinzufügen
          </Button>
        </div>
      )}

      {loeschFehler && (
        <p role="alert" className="text-sm text-danger">
          {loeschFehler}
        </p>
      )}

      {eintraege.length === 0 ? (
        <EmptyState
          icon={WartungIcon}
          title={
            darfSchreiben
              ? "Noch keine Einträge. Trag den letzten Service oder die letzte MFK ein — Strado rechnet ab da weiter."
              : "Noch keine Einträge."
          }
        />
      ) : (
        <Card as="ul" className="flex flex-col divide-y divide-border">
          {eintraege.map((eintrag) => (
            <li key={eintrag.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{WARTUNGSART_LABEL[eintrag.art]}</p>
                <p className="shrink-0 text-sm text-muted tabular-nums">
                  {datumText(eintrag.datum)}
                </p>
              </div>
              {(eintrag.km_stand !== null || eintrag.kosten_chf !== null) && (
                <p className="text-sm text-muted tabular-nums">
                  {[
                    eintrag.km_stand !== null ? kmText(eintrag.km_stand) : null,
                    eintrag.kosten_chf !== null ? betragText(eintrag.kosten_chf) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {eintrag.notiz && <p className="text-sm break-words text-muted">{eintrag.notiz}</p>}
              <div className="flex gap-3 pt-1">
                {darfSchreiben && (
                  <button
                    type="button"
                    onClick={() => setBearbeitet(eintrag)}
                    className="text-xs text-muted transition-colors duration-fast hover:text-foreground"
                  >
                    Ändern
                  </button>
                )}
                {/* Auch ohne Abo: die Einträge sind die Daten der Person. */}
                <button
                  type="button"
                  onClick={() => setZuLoeschen(eintrag)}
                  disabled={loeschLaeuft}
                  className="text-xs text-muted transition-colors duration-fast hover:text-foreground disabled:opacity-50"
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </Card>
      )}

      <Dialog open={neuOffen} onClose={() => setNeuOffen(false)} title="Eintrag hinzufügen">
        {/* key: nach einem gespeicherten Eintrag beginnt das Formular leer,
            statt die alten Werte des letzten Eintrags weiterzutragen. */}
        <EintragFormular
          key={neuOffen ? "offen" : "zu"}
          aktion={addWartungseintrag}
          fahrzeugId={fahrzeugId}
          fahrzeugTyp={fahrzeugTyp}
          heute={heute}
          onFertig={() => setNeuOffen(false)}
          onAbbrechen={() => setNeuOffen(false)}
        />
      </Dialog>

      <Dialog open={bearbeitet !== null} onClose={() => setBearbeitet(null)} title="Eintrag ändern">
        {bearbeitet && (
          <EintragFormular
            key={bearbeitet.id}
            aktion={updateWartungseintrag}
            fahrzeugId={fahrzeugId}
            fahrzeugTyp={fahrzeugTyp}
            heute={heute}
            eintrag={bearbeitet}
            onFertig={() => setBearbeitet(null)}
            onAbbrechen={() => setBearbeitet(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={zuLoeschen !== null}
        title="Eintrag löschen"
        description={
          zuLoeschen
            ? `${WARTUNGSART_LABEL[zuLoeschen.art]} vom ${datumText(zuLoeschen.datum)} wird dauerhaft entfernt.`
            : undefined
        }
        confirmLabel="Löschen"
        variant="danger"
        pending={loeschLaeuft}
        onCancel={() => setZuLoeschen(null)}
        onConfirm={() => {
          const eintrag = zuLoeschen;
          if (!eintrag) return;
          setZuLoeschen(null);
          setLoeschFehler(null);
          startLoeschen(async () => {
            const ergebnis = await deleteWartungseintrag(eintrag.id);
            if (ergebnis.error) setLoeschFehler(ergebnis.error);
          });
        }}
      />
    </div>
  );
}
