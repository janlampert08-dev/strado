"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  creatorLinkZuweisen,
  type CreatorLinkResult,
} from "@/lib/actions/creatorLinks";
import NutzerWahl from "@/components/NutzerWahl";
import Button from "@/components/ui/Button";

const initialState: CreatorLinkResult = { error: null };

// Wem dieser Code gehört — die Vergabe der Creator-Rolle, an genau der
// Stelle, an der der Code auch angelegt und abgeschaltet wird.
//
// Ein Formular für beide Richtungen: ein gewähltes Konto weist zu, ein über
// "Ändern" geleertes Feld nimmt die Zuweisung zurück. Ein zweiter Knopf
// "Entfernen" wäre ein zweiter Weg zur selben Änderung — und einer, der
// stumm danebenstünde, solange gar nichts zugewiesen ist.
export default function CreatorZuweisung({
  code,
  kontoId,
  kontoName,
}: {
  code: string;
  kontoId: string | null;
  kontoName: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    creatorLinkZuweisen,
    initialState,
  );

  // Ohne Rückmeldung ist "gespeichert" von "noch nicht abgeschickt" nicht zu
  // unterscheiden: NutzerWahl zeigt das gewählte Konto schon vor dem
  // Absenden, und der Knopf fällt danach in seine Ruhebeschriftung zurück.
  // Anders als beim Aktivieren oder Löschen ändert sich hier sichtbar
  // nichts, also wird es gesagt. Am Übergang pending true -> false erkannt,
  // damit die Server Action (geschützter Bereich) unverändert bleibt.
  const [gespeichert, setGespeichert] = useState(false);
  const warPending = useRef(false);

  useEffect(() => {
    if (warPending.current && !pending) setGespeichert(!state.error);
    warPending.current = pending;
  }, [pending, state]);

  return (
    <form
      action={formAction}
      onSubmit={() => setGespeichert(false)}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="code" value={code} />
      <NutzerWahl
        name="creator_user_id"
        gewaehltId={kontoId}
        gewaehltName={kontoName}
        label="Gehört zu"
        hinweis="Dieses Konto sieht die Zahlen zu diesem Code unter /creator. Leer lassen heisst: niemandem."
      />
      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      {gespeichert && !state.error && (
        <p role="status" className="text-xs text-muted">
          Zuweisung gespeichert.
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Wird gespeichert…" : "Zuweisung speichern"}
        </Button>
      </div>
    </form>
  );
}
